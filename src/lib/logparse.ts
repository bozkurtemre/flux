// Lines of a log file as the rows Flux shows. A file has no schema, so each line is read the way
// its writer most likely meant it: a JSON object; Laravel's `[date] env.LEVEL: message {context}`;
// logfmt's `key=value` pairs; or a date, a level and the rest. A line that starts none of these is
// the continuation of the one before — a stack trace — and is joined onto it.
import { flatten } from "./datasource";

export type Row = Record<string, unknown>;

/** The time at the start of a line: ISO, or `YYYY-MM-DD HH:MM:SS` with or without brackets. */
const LEADING_TIME = /^\[?(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?)\]?\s*/;
const LARAVEL = /^\[(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?)\]\s+([\w-]+)\.([A-Za-z]+):\s?([\s\S]*)$/;
const LEVEL = /^\[?(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|CRITICAL|CRIT|ALERT|EMERGENCY|FATAL|PANIC)\]?:?\s+/i;
const LOGFMT_PAIR = /([\w.@-]+)=("(?:\\.|[^"])*"|\S*)/g;

const TIME_KEYS = ["timestamp", "@timestamp", "time", "ts", "datetime", "date", "t"];
const LEVEL_KEYS = ["level", "log.level", "severity", "level_name", "loglevel", "lvl"];
const MESSAGE_KEYS = ["message", "msg", "log", "text"];

/** An instant as ISO, from a date string or epoch seconds or milliseconds; null if it is neither. */
export function isoOf(v: unknown): string | null {
  if (typeof v === "number" || (typeof v === "string" && /^\d{10}(\.\d+)?$|^\d{13}$/.test(v))) {
    const n = Number(v);
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\d/.test(v)) return null;
  // a comma before the milliseconds is Python's and Java's way of writing a dot
  const text = v.replace(" ", "T").replace(/,(\d+)/, ".$1");
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const pick = (row: Row, keys: string[]) => keys.find((k) => row[k] != null && row[k] !== "");

/** A JSON line, with the time, the level and the message under the names Flux uses. */
function fromJson(line: string): Row | null {
  if (!line.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = flatten(parsed as Record<string, unknown>);
  const time = pick(row, TIME_KEYS);
  const at = time ? isoOf(row[time]) : null;
  const level = pick(row, LEVEL_KEYS);
  const message = pick(row, MESSAGE_KEYS);
  return {
    ...row,
    ...(at ? { timestamp: at } : {}),
    ...(level && level !== "level" ? { level: row[level] } : {}),
    ...(message && message !== "message" ? { message: row[message] } : {}),
  };
}

/** Laravel's line, and the JSON context it puts after the message. */
function fromLaravel(line: string): Row | null {
  const m = LARAVEL.exec(line);
  if (!m) return null;
  const [, time, env, level, rest] = m;
  const row: Row = { timestamp: isoOf(time), env, level: level.toUpperCase() };
  // the context is the last JSON object on the line, then an empty `[]` for the extras
  const ctx = /\s(\{.*\}|\[.+\])\s*(\[\])?\s*$/.exec(rest);
  if (ctx) {
    try {
      const value = JSON.parse(ctx[1]) as unknown;
      if (value && typeof value === "object") Object.assign(row, flatten(Array.isArray(value) ? { context: value } : { context: value }));
      row.message = rest.slice(0, ctx.index).trim();
      return row;
    } catch {
      /* not JSON after all: the whole rest is the message */
    }
  }
  row.message = rest.replace(/\s*\[\]\s*\[\]\s*$/, "").trim();
  return row;
}

/** logfmt: two or more `key=value` pairs, the line starting with one. */
function fromLogfmt(line: string): Row | null {
  if (!/^[\w.@-]+=/.test(line)) return null;
  const row: Row = {};
  let pairs = 0;
  for (const [, key, raw] of line.matchAll(LOGFMT_PAIR)) {
    row[key] = raw.startsWith('"') ? raw.slice(1, -1).replace(/\\"/g, '"') : raw;
    pairs++;
  }
  if (pairs < 2) return null;
  const time = pick(row, TIME_KEYS);
  const at = time ? isoOf(row[time]) : null;
  const level = pick(row, LEVEL_KEYS);
  const message = pick(row, MESSAGE_KEYS);
  return {
    ...row,
    ...(at ? { timestamp: at } : {}),
    ...(level && level !== "level" ? { level: row[level] } : {}),
    ...(message && message !== "message" ? { message: row[message] } : {}),
  };
}

/** A date, maybe a level, and the rest as the message. Null when the line has no date. */
function fromPlain(line: string): Row | null {
  const t = LEADING_TIME.exec(line);
  if (!t) return null;
  let rest = line.slice(t[0].length);
  const row: Row = { timestamp: isoOf(t[1]) };
  const l = LEVEL.exec(rest);
  if (l) {
    row.level = l[1].toUpperCase();
    rest = rest.slice(l[0].length);
  }
  // what follows may still be JSON, as a container writes it after its own date
  const json = fromJson(rest.trim());
  if (json) return { ...json, timestamp: json.timestamp ?? row.timestamp, ...(row.level && !json.level ? { level: row.level } : {}) };
  row.message = rest;
  // `key=value` pairs in the text are fields as well: the request id a plain line carries is
  // what joins it to the other services' lines
  for (const [, key, raw] of rest.matchAll(LOGFMT_PAIR)) {
    if (!(key in row)) row[key] = raw.startsWith('"') ? raw.slice(1, -1).replace(/\\"/g, '"') : raw;
  }
  return row;
}

/** One line read as a message on its own, or null when it continues the one before. */
export function parseLine(line: string): Row | null {
  return fromJson(line) ?? fromLaravel(line) ?? fromLogfmt(line) ?? fromPlain(line);
}

/**
 * The rows of a stretch of log. Each carries the stream it came from, an id that stays the same
 * across reads, and a time: its own, or the one before it, or `fallback` for a file that never
 * says. `prefix` is a time each line may start with that is not the writer's — Docker's — taken
 * off before the line is read and used when the line has none of its own.
 */
export function parseLog(text: string, stream: string, fallback: string, o: { prefix?: RegExp } = {}): Row[] {
  const rows: Row[] = [];
  let last: string | undefined;
  let n = 0;
  for (const raw of text.split("\n")) {
    n++;
    let line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    let outer: string | null = null;
    if (o.prefix) {
      const p = o.prefix.exec(line);
      if (p) {
        outer = isoOf(p[1]);
        line = line.slice(p[0].length);
      }
    }
    const row = parseLine(line.trim().startsWith("{") ? line.trim() : line);
    if (!row) {
      // a stack trace, or a message written over several lines: it belongs to the one before
      const prev = rows[rows.length - 1];
      if (prev && !outer) {
        prev.message = `${String(prev.message ?? "")}\n${line}`;
        continue;
      }
    }
    const at = (row?.timestamp as string | null | undefined) ?? outer ?? last ?? fallback;
    last = at;
    rows.push({ ...(row ?? { message: line }), timestamp: at, streams: stream, source: stream, _id: `${stream}:${n}` });
  }
  return rows;
}
