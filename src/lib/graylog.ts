// Graylog 5.2 client. Requests go through Tauri's HTTP plugin, which issues them from
// Rust, so there is no CORS preflight and no proxy server.
import { fetch } from "@tauri-apps/plugin-http";

export type TimeRange = { type: "absolute"; from: string; to: string } | { type: "relative"; range: number };

let requestTimeoutMs = 60_000;

/** Settings › Advanced controls how long a Graylog call may take. */
export function setRequestTimeout(seconds: number) {
  requestTimeoutMs = Math.max(1, seconds) * 1000;
}

export function absolute(from: Date, to: Date): TimeRange {
  return { type: "absolute", from: from.toISOString(), to: to.toISOString() };
}

export interface Stream {
  id: string;
  title: string;
  description?: string;
  disabled: boolean;
}

export interface FieldInfo {
  name: string;
  type: string;
}

export interface MessagePage {
  columns: string[];
  rows: Record<string, unknown>[];
}

export class Graylog {
  private auth: string;

  constructor(
    public url: string,
    token: string,
  ) {
    this.url = url.replace(/\/$/, "");
    // Graylog access tokens authenticate as basic <token>:token
    this.auth = "Basic " + btoa(`${token}:token`);
  }

  private async call<T>(path: string, init: RequestInit & { mediaType?: string } = {}): Promise<T> {
    const mediaType = init.mediaType ?? "application/json";
    const res = await fetch(this.url + path, {
      ...init,
      headers: {
        Authorization: this.auth,
        Accept: mediaType,
        "Content-Type": mediaType,
        "X-Requested-By": "Flux",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${path.split("?")[0]}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async version(): Promise<string> {
    const r = await this.call<{ version: string }>("/api/system");
    return r.version;
  }

  async streams(): Promise<Stream[]> {
    const r = await this.call<{ streams: Stream[] }>("/api/streams");
    return r.streams.filter((s) => !s.disabled).sort((a, b) => a.title.localeCompare(b.title));
  }

  async fields(streamId: string, rangeSec = 604800): Promise<FieldInfo[]> {
    const r = await this.call<{ name: string; type: { type: string } }[]>("/api/views/fields", {
      method: "POST",
      body: JSON.stringify({ streams: [streamId], timerange: { type: "relative", range: rangeSec } }),
    });
    return r.map((f) => ({ name: f.name, type: f.type.type })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Scripting API search. Returns rows keyed by field name, newest first by default. */
  async messages(o: {
    query: string;
    streams: string[];
    timerange: TimeRange;
    fields: string[];
    size?: number;
    from?: number;
    sortOrder?: "asc" | "desc";
  }): Promise<MessagePage> {
    const r = await this.call<{ schema: { name: string }[]; datarows: unknown[][] }>("/api/search/messages", {
      method: "POST",
      body: JSON.stringify({
        query: o.query || "*",
        streams: o.streams,
        timerange: o.timerange,
        fields: o.fields,
        sort: "timestamp",
        sort_order: o.sortOrder ?? "desc",
        from: o.from ?? 0,
        size: o.size ?? 200,
      }),
    });
    const columns = r.schema.map((c) => c.name.replace(/^field: /, ""));
    return {
      columns,
      rows: r.datarows.map((row) => Object.fromEntries(columns.map((n, i) => [n, row[i]]))),
    };
  }

  /** Grouped counts, e.g. endpoints in a stream. No time bucketing in 5.2. */
  async aggregate(o: {
    query: string;
    streams: string[];
    timerange: TimeRange;
    groupBy: { field: string; limit?: number }[];
    metrics: { function: string; field?: string; configuration?: Record<string, number> }[];
  }): Promise<{ columns: string[]; rows: unknown[][] }> {
    const r = await this.call<{ schema: { name: string }[]; datarows: unknown[][] }>("/api/search/aggregate", {
      method: "POST",
      body: JSON.stringify({
        query: o.query || "*",
        streams: o.streams,
        timerange: o.timerange,
        group_by: o.groupBy.map((g) => ({ field: g.field, limit: g.limit ?? 500 })),
        metrics: o.metrics,
      }),
    });
    return { columns: r.schema.map((c) => c.name), rows: r.datarows };
  }

  /** Total messages matching a query, used for result counts. */
  async count(o: { query: string; streams: string[]; timerange: TimeRange }): Promise<number> {
    const r = await this.aggregate({ ...o, groupBy: [], metrics: [{ function: "count" }] }).catch(() => null);
    if (r?.rows.length) return Number(r.rows[0][r.rows[0].length - 1]) || 0;
    return 0;
  }
}

/** Escape Lucene metacharacters in a value. */
export function q(v: string): string {
  return v.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, "\\$1");
}

export const QUICK_RANGES: { label: string; seconds: number }[] = [
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "1h", seconds: 3600 },
  { label: "4h", seconds: 14400 },
  { label: "24h", seconds: 86400 },
  { label: "7d", seconds: 604800 },
  { label: "30d", seconds: 2592000 },
];
