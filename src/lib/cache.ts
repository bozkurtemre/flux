// Introspection cache: what a connection looks like, so the tree opens without waiting
// on Graylog. Regenerable by definition; bump FORMAT to invalidate every entry at once.
import { invoke } from "@tauri-apps/api/core";
import type { EndpointRow } from "./endpoints";
import type { FieldInfo, Stream } from "./datasource";

const FORMAT = 1;

export interface StreamCache {
  endpoints: EndpointRow[];
  fields: FieldInfo[];
  fetchedAt: string;
}

export interface ConnectionCache {
  format: number;
  streams: Stream[];
  streamsFetchedAt: string;
  byStream: Record<string, StreamCache>;
}

const empty = (): ConnectionCache => ({ format: FORMAT, streams: [], streamsFetchedAt: "", byStream: {} });

/** In-memory copy so a tree render never waits on the disk. */
const live = new Map<string, ConnectionCache>();

export async function load(connId: string): Promise<ConnectionCache> {
  const cached = live.get(connId);
  if (cached) return cached;
  let parsed = empty();
  try {
    const raw = await invoke<string | null>("cache_read", { key: connId });
    if (raw) {
      const candidate = JSON.parse(raw) as ConnectionCache;
      // a format bump is a discard, never a migration: the data is free to re-derive
      if (candidate.format === FORMAT) parsed = candidate;
    }
  } catch {
    /* an unreadable cache is the same as no cache */
  }
  live.set(connId, parsed);
  return parsed;
}

async function persist(connId: string, cache: ConnectionCache): Promise<void> {
  live.set(connId, cache);
  try {
    await invoke("cache_write", { key: connId, value: JSON.stringify(cache) });
  } catch {
    /* the app still works from memory if the cache directory is not writable */
  }
}

export async function putStreams(connId: string, streams: Stream[]): Promise<void> {
  const cache = await load(connId);
  await persist(connId, { ...cache, streams, streamsFetchedAt: new Date().toISOString() });
}

export async function putStream(connId: string, streamId: string, entry: Omit<StreamCache, "fetchedAt">): Promise<void> {
  const cache = await load(connId);
  await persist(connId, {
    ...cache,
    byStream: { ...cache.byStream, [streamId]: { ...entry, fetchedAt: new Date().toISOString() } },
  });
}

export async function clear(): Promise<number> {
  live.clear();
  return invoke<number>("cache_clear");
}

export async function location(): Promise<string> {
  return invoke<string>("cache_location");
}

/** Connection ids are uuids; the Rust side refuses anything else, so keep them clean. */
export function cacheKey(connId: string): string {
  return connId.replace(/[^A-Za-z0-9_-]/g, "");
}
