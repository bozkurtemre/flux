// Read-only views over a watchdog MongoDB. Every call crosses into Rust; see src-tauri/src/mongo.rs.
import { invoke } from "@tauri-apps/api/core";

export type Json = Record<string, unknown>;

export async function ping(uri: string): Promise<string> {
  return invoke<string>("mongo_ping", { uri });
}

export async function aggregate(uri: string, collection: string, pipeline: Json[]): Promise<Json[]> {
  return invoke<Json[]>("mongo_aggregate", { uri, collection, pipeline });
}

export async function distinct(uri: string, collection: string, field: string, filter: Json = {}): Promise<unknown[]> {
  return invoke<unknown[]>("mongo_distinct", { uri, collection, field, filter });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

/** Mongo needs real Dates; the bridge speaks JSON, so send the extended-JSON form. */
export function date(d: Date) {
  return { $date: d.toISOString() };
}

export interface EndpointRow {
  endpoint: string;
  method: string;
  requests: number;
  errors: number;
  errorRatePct: number;
  p95Ms: number | null;
}

/** Endpoints seen on a stream, already normalized by watchdog. */
export async function endpointsForStream(uri: string, env: string, streamId: string, since: Date): Promise<EndpointRow[]> {
  const rows = await aggregate(uri, "metric_buckets", [
    { $match: { env, streamId, ts: { $gte: date(since) } } },
    {
      $group: {
        _id: { endpoint: "$endpoint", method: "$method" },
        requests: { $sum: "$count" },
        errors: { $sum: { $cond: [{ $gte: ["$status", 500] }, "$count", 0] } },
        p95: { $avg: "$p95Ms" },
      },
    },
    { $sort: { requests: -1 } },
    { $limit: 2000 },
  ]);
  return rows.map((r) => {
    const id = r._id as { endpoint: string; method: string };
    const requests = Number(r.requests) || 0;
    const errors = Number(r.errors) || 0;
    return {
      endpoint: id.endpoint,
      method: id.method ?? "",
      requests,
      errors,
      errorRatePct: requests ? (errors / requests) * 100 : 0,
      p95Ms: r.p95 == null ? null : Number(r.p95),
    };
  });
}

export interface SeriesPoint {
  ts: string;
  requests: number;
  errors: number;
  p95Ms: number | null;
}

export async function endpointSeries(
  uri: string,
  env: string,
  streamId: string,
  endpoint: string,
  method: string,
  since: Date,
): Promise<SeriesPoint[]> {
  const rows = await aggregate(uri, "metric_buckets", [
    { $match: { env, streamId, endpoint, method, ts: { $gte: date(since) } } },
    {
      $group: {
        _id: "$ts",
        requests: { $sum: "$count" },
        errors: { $sum: { $cond: [{ $gte: ["$status", 500] }, "$count", 0] } },
        p95: { $avg: "$p95Ms" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({
    ts: String(r._id),
    requests: Number(r.requests) || 0,
    errors: Number(r.errors) || 0,
    p95Ms: r.p95 == null ? null : Number(r.p95),
  }));
}

/** Stream ids grouped by the project watchdog assigned them. */
export async function projectsFromMongo(uri: string, env: string): Promise<{ project: string; streams: string[] }[]> {
  const rows = await aggregate(uri, "metric_buckets", [
    { $match: { env } },
    { $group: { _id: { p: "$projectName", s: "$streamId" } } },
    { $group: { _id: "$_id.p", streams: { $addToSet: "$_id.s" } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ project: String(r._id), streams: (r.streams as string[]) ?? [] }));
}
