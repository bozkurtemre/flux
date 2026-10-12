// Where the logs come from. Each connection names a kind of source, and an adapter for that kind
// answers every question Flux asks — the streams, their fields, the messages, counts, groups and
// the timeline — in one shape, so nothing above this file knows which server it is talking to.
// Requests go through Tauri's HTTP plugin, which issues them from Rust: no CORS preflight, and
// no proxy server.
import { fetch } from "@tauri-apps/plugin-http";

export type SourceKind = "graylog" | "kibana" | "local";

/** What the Connections page and the tree say about each kind. */
export const SOURCE_KINDS: Record<SourceKind, { label: string; streams: string; url: string; token: string; columns: string[] }> = {
  graylog: {
    label: "Graylog",
    streams: "streams",
    url: "https://graylog.example.com:9000",
    token: "Graylog profile › Edit tokens.",
    columns: ["timestamp", "source", "level", "message"],
  },
  kibana: {
    label: "Elasticsearch (Kibana)",
    streams: "data views",
    url: "https://kibana.example.com  (add /s/<space> for a space other than the default)",
    token: "Kibana › Stack Management › API keys, the Encoded value.",
    columns: ["timestamp", "host.name", "log.level", "message"],
  },
  local: {
    label: "Local files & Docker",
    streams: "logs",
    url: "/var/log/myapp  —  or  docker",
    token: "Not needed.",
    columns: ["timestamp", "source", "level", "message"],
  },
};

export type TimeRange = { type: "absolute"; from: string; to: string } | { type: "relative"; range: number };

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

/** One column of the timeline: when the bucket starts, and how many messages fell in it. */
export interface Bucket {
  at: string;
  count: number;
  /** For an endpoint: the 95th percentile of its duration, and how many failed. */
  p95?: number;
  errors?: number;
}

/**
 * A page of messages. Every row carries `timestamp` as an ISO string, whatever the source calls
 * its time field, and an id under `gl2_message_id` or `_id` when the source has one.
 */
export interface MessagePage {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface Metric {
  function: string;
  field?: string;
  configuration?: Record<string, number>;
}

/** Every adapter answers these, with a Lucene query string as the search. */
export interface DataSource {
  kind: SourceKind;
  version(signal?: AbortSignal): Promise<string>;
  streams(signal?: AbortSignal): Promise<Stream[]>;
  fields(streamId: string, rangeSec?: number, signal?: AbortSignal): Promise<FieldInfo[]>;
  /** Newest first by default. */
  messages(o: {
    query: string;
    streams: string[];
    timerange: TimeRange;
    fields: string[];
    size?: number;
    from?: number;
    sortOrder?: "asc" | "desc";
    signal?: AbortSignal;
  }): Promise<MessagePage>;
  /** One row per combination of the groups: the group values, then each metric, in order. */
  aggregate(o: {
    query: string;
    streams: string[];
    timerange: TimeRange;
    groupBy: { field: string; limit?: number }[];
    metrics: Metric[];
    signal?: AbortSignal;
  }): Promise<{ columns: string[]; rows: unknown[][] }>;
  histogram(o: { query: string; streams: string[]; timerange: TimeRange; interval: string; signal?: AbortSignal }): Promise<Bucket[]>;
  /** Requests, the 95th percentile of `durationField` and the failures, per bucket. */
  latency(o: {
    query: string;
    errorQuery?: string;
    durationField: string;
    streams: string[];
    timerange: TimeRange;
    interval: string;
    signal?: AbortSignal;
  }): Promise<Bucket[]>;
  count(o: { query: string; streams: string[]; timerange: TimeRange; signal?: AbortSignal }): Promise<number>;
}

let requestTimeoutMs = 60_000;

/** Settings › Advanced controls how long a call to a source may take. */
export function setRequestTimeout(seconds: number) {
  requestTimeoutMs = Math.max(1, seconds) * 1000;
}

/**
 * One JSON request, with the timeout from Settings. `label` names it in the error, which for a
 * request proxied through another server is not the URL it was sent to.
 */
export async function request<T>(url: string, init: RequestInit & { label: string; mediaType?: string }): Promise<T> {
  const mediaType = init.mediaType ?? "application/json";
  // two ways to give up: the timeout, and whoever started this deciding they are done
  // waiting. They are told apart afterwards, because only one of them is a failure.
  const timeout = AbortSignal.timeout(requestTimeoutMs);
  const res = await fetch(url, {
    ...init,
    headers: { Accept: mediaType, "Content-Type": mediaType, ...(init.headers ?? {}) },
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  }).catch((e: unknown) => {
    if (timeout.aborted) throw new Error("Operation timed out.");
    throw e;
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${init.label}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** A nested document as the flat, dotted fields Flux shows: `{ log: { level } }` is `log.level`. */
export function flatten(source: Record<string, unknown>, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value as Record<string, unknown>, name, out);
    else out[name] = value;
  }
  return out;
}

/** Which row is which, across two pages of the same search. */
export function rowKey(row: Record<string, unknown>): string {
  return String(row.gl2_message_id ?? row._id ?? `${String(row.timestamp)}|${String(row.message)}`);
}

export function absolute(from: Date, to: Date): TimeRange {
  return { type: "absolute", from: from.toISOString(), to: to.toISOString() };
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

/**
 * The timeline with what has just arrived counted into it. Following puts new messages on the
 * page every couple of seconds, and asking the source to draw the buckets again that often would
 * cost two requests a tick — but the rows themselves say when they arrived, which is all a
 * bucket is. Buckets are appended when the newest message is past the last one, so a live
 * timeline grows rightwards instead of ending where the query did.
 */
export function bucketed(buckets: Bucket[], arrivals: string[], limit = 200): Bucket[] {
  if (!buckets.length || !arrivals.length) return buckets;
  const first = new Date(buckets[0].at).getTime();
  const span = buckets.length > 1 ? new Date(buckets[1].at).getTime() - first : 60_000;
  if (!(span > 0)) return buckets;

  const counts = new Map(buckets.map((b, i) => [i, b]));
  let last = buckets.length - 1;
  for (const at of arrivals) {
    const time = new Date(at).getTime();
    if (Number.isNaN(time) || time < first) continue;
    const index = Math.floor((time - first) / span);
    if (index > last) {
      // the gap is drawn as the quiet it was, unless it is so long that this is another day
      if (index - last > limit) continue;
      for (let i = last + 1; i <= index; i++) counts.set(i, { at: new Date(first + i * span).toISOString(), count: 0 });
      last = index;
    }
    const bucket = counts.get(index);
    if (bucket) counts.set(index, { ...bucket, count: bucket.count + 1 });
  }
  return Array.from({ length: last + 1 }, (_, i) => counts.get(i) ?? { at: new Date(first + i * span).toISOString(), count: 0 });
}

/**
 * The bucket width for a span, in the units Graylog and Elasticsearch both read: about fifty columns whatever the
 * range, from a minute of logs to a month of them.
 */
export function bucketFor(seconds: number, columns = 50): string {
  const units: [number, string][] = [
    [1, "1s"],
    [5, "5s"],
    [10, "10s"],
    [30, "30s"],
    [60, "1m"],
    [300, "5m"],
    [600, "10m"],
    [1800, "30m"],
    [3600, "1h"],
    [10800, "3h"],
    [21600, "6h"],
    [86400, "1d"],
    [604800, "1w"],
  ];
  // the unit that comes closest to that many columns, rather than the first one over: an
  // hour is fifty-odd minutes or a dozen five-minute blocks, and the first reads better
  let best = units[0];
  for (const unit of units) {
    if (Math.abs(seconds / unit[0] - columns) < Math.abs(seconds / best[0] - columns)) best = unit;
  }
  return best[1];
}
