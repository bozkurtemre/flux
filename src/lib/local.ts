// Logs on this machine as a source: the files under a folder, or Docker's containers. There is
// no server to ask, so this adapter is the server — it reads the end of each log, parses it into
// rows, and answers the same questions the others do, the Lucene included, over those rows in
// memory. That is what lets Flux be tried with nothing but a log file.
import { invoke } from "@tauri-apps/api/core";
import { filter, parse, type LiqeQuery } from "liqe";
import type { Bucket, DataSource, FieldInfo, MessagePage, Metric, Stream, TimeRange } from "./datasource";
import { parseLog, type Row } from "./logparse";

/** The address that means Docker rather than a folder. */
export const DOCKER = "docker";

/**
 * ponytail: the last 16 MB of a file, or 20,000 lines of a container, is what is searched; a
 * window further back than that finds nothing. Reading by time range would need an index.
 */
const READ_BYTES = 16 * 1024 * 1024;
const DOCKER_LINES = 20000;
const DOCKER_TIME = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\s/;

/**
 * The console's Lucene as liqe reads it. liqe has no `_exists_`, and reads a `/` in an unquoted
 * value as the start of a regular expression, which a route always has; both are rewritten.
 */
export function toLiqe(query: string): string {
  const q = query.trim() || "*";
  return (
    q
      .replace(/_exists_:([\w.@-]+)/g, "$1:*")
      // `level:(ERROR OR FATAL)` is Lucene's and not liqe's: each term takes the field instead,
      // which is how the error query the radar, the Monitor and New errors write reads here
      .replace(/(^|[\s(!+-])([\w.@-]+):\(([^()]*)\)/g, (_, lead: string, field: string, inner: string) => {
        const terms = inner.replace(/"(?:\\.|[^"\\])*"|[^\s()]+/g, (t) =>
          /^(AND|OR|NOT|&&|\|\|)$/.test(t) ? t : t.replace(/^([-+!]?)/, `$1${field}:`),
        );
        return `${lead}(${terms})`;
      })
      .replace(/(^|[\s(!+-])([\w.@-]+):((?:\\.|[^\s()"[\]{}])+)/g, (whole, lead: string, field: string, value: string) => {
        if (!value.includes("/") || (value.startsWith("/") && value.length > 1 && value.endsWith("/") && !value.endsWith("\\/"))) return whole;
        const literal = value.replace(/\\(.)/g, "$1");
        const pattern = literal
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\//g, "\\/")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".");
        return `${lead}${field}:/^${pattern}$/i`;
      })
  );
}

interface Loaded {
  stamp: string;
  rows: Row[];
  times: number[];
}

/** A Graylog time unit — `30s`, `5m`, `1h`, `1d`, `1w` — in milliseconds. */
export function unitMs(interval: string): number {
  const m = /^(\d+)([smhdw])$/.exec(interval);
  if (!m) return 60_000;
  return Number(m[1]) * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[m[2] as "s"];
}

/** The `p`th percentile of some numbers, by nearest rank; null for none. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/** A metric over a set of rows, as the other sources answer it. */
export function metricOf(rows: Row[], m: Metric): number | null {
  if (!["count", "card", "percentile", "avg", "sum", "min", "max"].includes(m.function)) {
    throw new Error(`${m.function}() is not something a local source can count`);
  }
  if (m.function === "count") return rows.length;
  const values = rows.map((r) => r[m.field ?? ""]);
  if (m.function === "card") return new Set(values.filter((v) => v != null && v !== "").map(String)).size;
  const numbers = values.map(Number).filter((n) => Number.isFinite(n));
  if (!numbers.length) return null;
  if (m.function === "percentile") return percentile(numbers, m.configuration?.percentile ?? 95);
  if (m.function === "avg") return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  if (m.function === "sum") return numbers.reduce((a, b) => a + b, 0);
  if (m.function === "min") return Math.min(...numbers);
  return Math.max(...numbers);
}

/** Rows grouped by the values of some fields, most rows first; a row missing a value is left out. */
export function groupRowsBy(rows: Row[], fields: string[]): { key: string[]; rows: Row[] }[] {
  const groups = new Map<string, { key: string[]; rows: Row[] }>();
  for (const row of rows) {
    const key = fields.map((f) => row[f]);
    if (key.some((v) => v == null || v === "")) continue;
    const text = key.map(String);
    const id = JSON.stringify(text);
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { key: text, rows: [] }));
    g.rows.push(row);
  }
  return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length);
}

/** Buckets of a fixed width across the rows' times, the quiet ones included between the first and last. */
export function bucketsOf(times: number[], interval: string): { at: number; indexes: number[] }[] {
  if (!times.length) return [];
  const width = unitMs(interval);
  const first = Math.floor(Math.min(...times) / width) * width;
  const last = Math.floor(Math.max(...times) / width) * width;
  const out = Array.from({ length: Math.min(2000, (last - first) / width + 1) }, (_, i) => ({ at: first + i * width, indexes: [] as number[] }));
  times.forEach((t, i) => out[Math.min(out.length - 1, Math.floor((t - first) / width))]?.indexes.push(i));
  return out;
}

function windowOf(range: TimeRange): [number, number] {
  if (range.type === "absolute") return [Date.parse(range.from), Date.parse(range.to)];
  const now = Date.now();
  return [now - range.range * 1000, now];
}

export class Local implements DataSource {
  readonly kind = "local" as const;
  private loaded = new Map<string, Loaded>();
  private compiled = new Map<string, LiqeQuery>();

  constructor(public url: string) {
    this.url = url.trim();
  }

  private get docker() {
    return this.url.toLowerCase() === DOCKER;
  }

  private shell(command: string): Promise<string> {
    return invoke<string>("terminal_run", { program: "", args: ["-l", "-c", command] });
  }

  async version(): Promise<string> {
    if (!this.docker) return "files";
    return (await this.shell("docker version --format '{{.Server.Version}}'")).trim();
  }

  async streams(): Promise<Stream[]> {
    if (this.docker) {
      const out = await this.shell("docker ps --format '{{.Names}}\t{{.Image}}'");
      return out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, image] = line.split("\t");
          return { id: name, title: name, description: image, disabled: false };
        })
        .sort((a, b) => a.title.localeCompare(b.title));
    }
    const files = await invoke<{ name: string; size: number; modified: number }[]>("local_list", { root: this.url });
    return files.map((f) => ({ id: f.name, title: f.name, description: `${(f.size / 1024).toFixed(0)} KB`, disabled: false }));
  }

  /** A stream's rows, read again only when the file changed — or, for a container, every couple of seconds. */
  private async load(stream: string, stamps: Map<string, string>): Promise<Loaded> {
    const stamp = this.docker ? String(Math.floor(Date.now() / 2000)) : (stamps.get(stream) ?? "");
    const cached = this.loaded.get(stream);
    if (cached && cached.stamp === stamp) return cached;
    const fallback = new Date().toISOString();
    const rows = this.docker
      ? parseLog(await this.shell(`docker logs --timestamps --tail ${DOCKER_LINES} ${shellWord(stream)} 2>&1`), stream, fallback, {
          prefix: DOCKER_TIME,
        })
      : parseLog(await invoke<string>("local_read", { root: this.url, name: stream, maxBytes: READ_BYTES }), stream, fallback);
    const loaded = { stamp, rows, times: rows.map((r) => Date.parse(String(r.timestamp))) };
    this.loaded.set(stream, loaded);
    return loaded;
  }

  private query(text: string): LiqeQuery {
    let q = this.compiled.get(text);
    if (!q) {
      // liqe's own message is a parser trace; its first line is the part worth reading
      let reason: string | undefined;
      try {
        q = parse(toLiqe(text));
      } catch (e) {
        reason = e instanceof Error ? e.message.split("\n")[0] : String(e);
      }
      if (!q) throw new Error(`Not a search a local source can read: ${reason ?? "unknown"}`);
      if (this.compiled.size > 200) this.compiled.clear();
      this.compiled.set(text, q);
    }
    return q;
  }

  /** The rows of some streams inside a window that match a search, with their times. */
  private async matching(streams: string[], range: TimeRange, query: string): Promise<{ rows: Row[]; times: number[] }> {
    const files = this.docker ? [] : await invoke<{ name: string; size: number; modified: number }[]>("local_list", { root: this.url });
    const stamps = new Map(files.map((f) => [f.name, `${f.size}:${f.modified}`]));
    const names = streams.length ? streams : this.docker ? (await this.streams()).map((s) => s.id) : files.map((f) => f.name);
    const [from, to] = windowOf(range);
    const inWindow: Row[] = [];
    for (const name of names) {
      const { rows, times } = await this.load(name, stamps);
      rows.forEach((r, i) => times[i] >= from && times[i] <= to && inWindow.push(r));
    }
    const rows = query.trim() && query.trim() !== "*" ? [...filter(this.query(query), inWindow)] : inWindow;
    return { rows, times: rows.map((r) => Date.parse(String(r.timestamp))) };
  }

  async fields(streamId: string): Promise<FieldInfo[]> {
    const { rows } = await this.matching([streamId], { type: "relative", range: 10 * 365 * 86400 }, "*");
    const types = new Map<string, string>();
    for (const row of rows.slice(-5000)) {
      for (const [k, v] of Object.entries(row)) {
        if (k === "_id" || types.has(k) || v == null) continue;
        types.set(
          k,
          k === "timestamp"
            ? "date"
            : typeof v === "number"
              ? Number.isInteger(v)
                ? "long"
                : "double"
              : typeof v === "boolean"
                ? "boolean"
                : "string",
        );
      }
    }
    return [...types].map(([name, type]) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name));
  }

  async messages(o: Parameters<DataSource["messages"]>[0]): Promise<MessagePage> {
    const { rows, times } = await this.matching(o.streams, o.timerange, o.query);
    const order = rows.map((_, i) => i).sort((a, b) => (o.sortOrder === "asc" ? times[a] - times[b] : times[b] - times[a]));
    const from = o.from ?? 0;
    const page = order.slice(from, from + (o.size ?? 200)).map((i) => rows[i]);
    return { columns: o.fields.length ? o.fields : [...new Set(page.flatMap((r) => Object.keys(r)))], rows: page };
  }

  async count(o: Parameters<DataSource["count"]>[0]): Promise<number> {
    return (await this.matching(o.streams, o.timerange, o.query)).rows.length;
  }

  async aggregate(o: Parameters<DataSource["aggregate"]>[0]): Promise<{ columns: string[]; rows: unknown[][] }> {
    const { rows } = await this.matching(o.streams, o.timerange, o.query);
    const groups = groupRowsBy(
      rows,
      o.groupBy.map((g) => g.field),
    ).slice(0, o.groupBy[0]?.limit ?? 500);
    return {
      columns: [...o.groupBy.map((g) => g.field), ...o.metrics.map((m) => `${m.function}(${m.field ?? ""})`)],
      rows: groups.map((g) => [...g.key, ...o.metrics.map((m) => metricOf(g.rows, m))]),
    };
  }

  async histogram(o: Parameters<DataSource["histogram"]>[0]): Promise<Bucket[]> {
    const { times } = await this.matching(o.streams, o.timerange, o.query);
    return bucketsOf(times, o.interval).map((b) => ({ at: new Date(b.at).toISOString(), count: b.indexes.length }));
  }

  async latency(o: Parameters<DataSource["latency"]>[0]): Promise<Bucket[]> {
    const { rows, times } = await this.matching(o.streams, o.timerange, o.query);
    const failed = o.errorQuery ? new Set(filter(this.query(o.errorQuery), rows)) : new Set<Row>();
    return bucketsOf(times, o.interval).map((b) => {
      const inside = b.indexes.map((i) => rows[i]);
      return {
        at: new Date(b.at).toISOString(),
        count: inside.length,
        p95: metricOf(inside, { function: "percentile", field: o.durationField, configuration: { percentile: 95 } }) ?? undefined,
        errors: inside.filter((r) => failed.has(r)).length,
      };
    });
  }
}

/** A container name as one word of a shell command. */
function shellWord(s: string): string {
  return /^[\w.-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}
