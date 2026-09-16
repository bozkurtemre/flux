// Endpoint rows derived from Graylog alone. One aggregation per stream; the result is
// cached on disk so the tree opens instantly and only refreshes when asked.
import { Graylog, type FieldInfo } from "./graylog";
import { makeNormalizer } from "./normalize";

export interface EndpointRow {
  endpoint: string; // normalized template
  method: string;
  requests: number;
  errors: number; // 5xx
  errorRatePct: number;
  p95Ms: number | null;
}

/** Field names a stream might use for the route, the method, the status and the duration. */
const CANDIDATES = {
  route: ["route", "uri", "path", "request_path", "url"],
  method: ["method", "http_method", "verb"],
  status: ["httpStatusCode", "httpStatus", "http_status", "status", "response"],
  duration: ["responseTime", "took_ms", "duration_ms", "totalResponseTime", "elapsed"],
} as const;

export interface FieldMapping {
  route: string;
  method?: string;
  status?: string;
  duration?: string;
  durationIsSeconds: boolean;
}

/**
 * Restrict the aggregation to the lines that represent a finished request.
 *
 * Without this, a service that logs several lines per request counts each of them:
 * on one production stream the unfiltered query reported 24.7M "requests" against an
 * actual 2.99M. A line carrying a duration is a completed request; a status is the next
 * best proxy. It also scans far less, which halves the query time.
 */
export function requestFilter(map: FieldMapping): string {
  if (map.duration) return `_exists_:${map.duration}`;
  if (map.status) return `_exists_:${map.status}`;
  return "*";
}

/** Pick the fields this stream actually has. Returns null when it carries no route at all. */
export function inferMapping(fields: FieldInfo[]): FieldMapping | null {
  const has = (n: string) => fields.some((f) => f.name === n);
  const pick = (names: readonly string[]) => names.find((n) => has(n));
  const route = pick(CANDIDATES.route);
  if (!route) return null;
  const duration = pick(CANDIDATES.duration);
  return {
    route,
    method: pick(CANDIDATES.method),
    status: pick(CANDIDATES.status),
    duration,
    // Graylog reports these as floats in seconds; only a *_ms name means milliseconds
    durationIsSeconds: !!duration && !/_?ms$/i.test(duration),
  };
}

/**
 * Two cheap aggregations rather than one expensive cube.
 *
 * Grouping route by method by status multiplies into hundreds of thousands of buckets on a
 * busy stream and times out. Grouping by route and method alone is a few thousand, and the
 * 5xx counts come from the same shape under a status filter, so the second query only ever
 * touches the error slice. Both run together.
 *
 * Cost is driven by the time range, not the bucket count: on the busiest production stream
 * one hour takes about a second, six hours four, twenty-four hours ten. Measurements are in
 * docs/research/graylog-cost.md.
 */
export async function endpointsFromGraylog(
  g: Graylog,
  streamId: string,
  fields: FieldInfo[],
  o: { lookbackHours: number; limit: number; rules?: [string, string][]; signal?: AbortSignal },
): Promise<EndpointRow[]> {
  const map = inferMapping(fields);
  if (!map) return [];

  const groupBy = [{ field: map.route, limit: o.limit }];
  if (map.method) groupBy.push({ field: map.method, limit: 12 });

  const metrics: { function: string; field?: string; configuration?: Record<string, number> }[] = [{ function: "count" }];
  if (map.duration) metrics.push({ function: "percentile", field: map.duration, configuration: { percentile: 95 } });

  const timerange = { type: "relative" as const, range: o.lookbackHours * 3600 };
  const filter = requestFilter(map);
  const [totals, failures] = await Promise.all([
    g.aggregate({ query: filter, streams: [streamId], timerange, groupBy, metrics, signal: o.signal }),
    map.status
      ? g
          .aggregate({
            query: `${filter} AND ${map.status}:>=500`,
            streams: [streamId],
            timerange,
            groupBy,
            metrics: [{ function: "count" }],
            signal: o.signal,
          })
          .catch(() => ({ columns: [], rows: [] as unknown[][] }))
      : Promise.resolve({ columns: [], rows: [] as unknown[][] }),
  ]);

  const normalize = makeNormalizer(o.rules ?? []);
  const methodAt = map.method ? 1 : -1;
  const countAt = groupBy.length;
  const p95At = map.duration ? countAt + 1 : -1;

  /** route and method identify a row in both result sets. */
  const keyOf = (row: unknown[]) => {
    const route = String(row[0] ?? "");
    if (!route || route === "(Empty Value)" || route === "/") return null;
    const method = methodAt >= 0 ? blank(String(row[methodAt] ?? "")) : "";
    return { key: `${method} ${normalize(route)}`, method, endpoint: normalize(route) };
  };

  const errorsByKey = new Map<string, number>();
  for (const row of failures.rows) {
    const k = keyOf(row);
    if (k) errorsByKey.set(k.key, (errorsByKey.get(k.key) ?? 0) + (Number(row[countAt]) || 0));
  }

  const merged = new Map<string, EndpointRow & { p95Weight: number; p95Sum: number }>();
  for (const row of totals.rows) {
    const k = keyOf(row);
    if (!k) continue;
    const count = Number(row[countAt]) || 0;
    const p95 = p95At >= 0 ? toMs(row[p95At], map.durationIsSeconds) : null;
    const prev = merged.get(k.key) ?? {
      endpoint: k.endpoint,
      method: k.method,
      requests: 0,
      errors: 0,
      errorRatePct: 0,
      p95Ms: null,
      p95Weight: 0,
      p95Sum: 0,
    };
    prev.requests += count;
    if (p95 != null) {
      prev.p95Weight += count;
      prev.p95Sum += p95 * count;
    }
    merged.set(k.key, prev);
  }

  return [...merged.values()].map((r) => {
    const errors = errorsByKey.get(`${r.method} ${r.endpoint}`) ?? 0;
    return {
      endpoint: r.endpoint,
      method: r.method,
      requests: r.requests,
      errors,
      errorRatePct: r.requests ? (errors / r.requests) * 100 : 0,
      p95Ms: r.p95Weight ? r.p95Sum / r.p95Weight : null,
    };
  });
}

export function sortEndpoints(rows: EndpointRow[], by: "traffic" | "name" | "errors"): EndpointRow[] {
  const copy = [...rows];
  if (by === "name") return copy.sort((a, b) => a.endpoint.localeCompare(b.endpoint) || a.method.localeCompare(b.method));
  if (by === "errors") return copy.sort((a, b) => b.errorRatePct - a.errorRatePct || b.requests - a.requests);
  return copy.sort((a, b) => b.requests - a.requests);
}

function blank(v: string): string {
  return v === "(Empty Value)" ? "" : v;
}

function toMs(v: unknown, seconds: boolean): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return seconds ? n * 1000 : n;
}
