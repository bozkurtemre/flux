// Monitor: a connection's health, read off its logs. Two kinds of numbers come together here.
// The counts — messages and failures per bucket — are asked of the source, so they are exact.
// The rest — which streams, hosts and levels, the failures that repeat, how slow — comes from a
// tail of the newest lines kept in memory, which is a sample on a busy system and all of it on
// a quiet one. What counts as a failure is read off those lines too, never assumed.
import { isFailure } from "./journey";
import { patternsOf, type Pattern } from "./patterns";

type Row = Record<string, unknown>;

/** The fields the tail asks for: when, what, from where, and what tells a failure or a duration. */
export const TAIL_FIELDS = [
  "gl2_message_id",
  "timestamp",
  "message",
  "source",
  "streams",
  "level",
  "level_name",
  "log.level",
  "severity",
  "httpStatusCode",
  "http_status",
  "status",
  "responseTime",
  "took_ms",
  "duration_ms",
  "elapsed",
];

const LEVELS = ["level", "level_name", "log.level", "severity"];
const STATUSES = ["httpStatusCode", "http_status", "status"];
const DURATIONS = ["responseTime", "took_ms", "duration_ms", "elapsed"];

/**
 * The query that counts failures, from what the lines actually carry: a level that is a word or
 * a syslog number, a status of 500 and up. Null when the lines give nothing to tell one by.
 */
export function errorQueryFrom(rows: Row[]): string | null {
  const parts: string[] = [];
  const level = LEVELS.find((f) => rows.some((r) => r[f] != null && r[f] !== ""));
  if (level) {
    const numeric = rows.every((r) => r[level] == null || r[level] === "" || /^\d+$/.test(String(r[level])));
    parts.push(numeric ? `${level}:<=3` : `${level}:(ERROR OR error OR CRITICAL OR critical OR ALERT OR EMERGENCY OR FATAL OR fatal)`);
  }
  const status = STATUSES.find((f) => rows.some((r) => Number.isFinite(Number(r[f])) && Number(r[f]) >= 100));
  if (status) parts.push(`${status}:>=500`);
  return parts.length ? parts.join(" OR ") : null;
}

/** The tail with the fresh lines on top: no line twice, nothing older than `since`, at most `max`. */
export function mergeTail(tail: Row[], fresh: Row[], key: (r: Row) => string, since: number, max = 5000): Row[] {
  const seen = new Set(tail.map(key));
  const added = fresh.filter((r) => !seen.has(key(r)));
  return [...added, ...tail].filter((r) => timeOf(r) >= since).slice(0, max);
}

export function timeOf(row: Row): number {
  const t = new Date(String(row.timestamp ?? "")).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** How long a line says its request took, in milliseconds; seconds unless the name says ms. */
export function durationOf(row: Row): number | null {
  for (const f of DURATIONS) {
    const n = Number(row[f]);
    if (row[f] == null || row[f] === "" || !Number.isFinite(n)) continue;
    return /_?ms$/i.test(f) ? n : n * 1000;
  }
  return null;
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export interface Share {
  name: string;
  count: number;
  failed: number;
}

/** How the tail divides by something, the most first: a stream, a host, a level. */
export function shares(rows: Row[], by: (r: Row) => string | null, limit = 8): Share[] {
  const found = new Map<string, Share>();
  for (const r of rows) {
    const name = by(r);
    if (!name) continue;
    const s = found.get(name) ?? { name, count: 0, failed: 0 };
    s.count += 1;
    if (isFailure(r)) s.failed += 1;
    found.set(name, s);
  }
  return [...found.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export const levelOf = (r: Row): string | null => {
  for (const f of LEVELS) {
    const v = r[f];
    if (v == null || v === "") continue;
    const text = String(v);
    // syslog's numbers, named as people say them
    return /^\d+$/.test(text)
      ? (["EMERGENCY", "ALERT", "CRITICAL", "ERROR", "WARNING", "NOTICE", "INFO", "DEBUG"][Number(text)] ?? text)
      : text.toUpperCase();
  }
  return null;
};

export interface Digest {
  sampled: number;
  failed: number;
  p95: number | null;
  p50: number | null;
  sources: number;
  streams: Share[];
  hosts: Share[];
  levels: Share[];
  failures: Pattern[];
}

/** Everything the dashboard says about the tail, in one pass's worth of work. */
export function digest(rows: Row[], streamName: (r: Row) => string | null): Digest {
  const durations = rows.map(durationOf).filter((d): d is number => d != null);
  const hosts = shares(rows, (r) => (r.source ? String(r.source) : null), 6);
  return {
    sampled: rows.length,
    failed: rows.filter(isFailure).length,
    p95: percentile(durations, 95),
    p50: percentile(durations, 50),
    sources: new Set(rows.map((r) => r.source).filter(Boolean)).size,
    streams: shares(rows, streamName, 6),
    hosts,
    levels: shares(rows, levelOf, 8),
    failures: patternsOf(rows.filter(isFailure), "message", 6),
  };
}
