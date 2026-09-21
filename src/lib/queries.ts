// Queries worth keeping. They describe the work rather than the machine, so a workspace keeps
// its own in `<folder>/.flux/queries.json` and a window with no workspace open keeps them in
// the config directory beside the other authored files. Opening a folder therefore swaps the
// list along with everything else that folder remembers.
import { load, type Store } from "@tauri-apps/plugin-store";
import { readWorkspaceFile, writeWorkspaceFile } from "./workspaces";
import type { NoticeKind } from "./progress";

export const QUERIES_FILE = "queries.json";
const FORMAT = 1;

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  /** What it was written against, so it can be opened again on the same stream. */
  connId: string;
  streamIds: string[];
  streamLabel: string;
  rangeSeconds: number;
  /** Seconds since the epoch: the list is newest first. */
  savedAt: number;
  /** Watched: while the window is open, new matches are reported as they arrive. */
  watch?: boolean;
  /** How often this one looks, in seconds. Absent means whatever Settings says. */
  watchSeconds?: number;
  /** How loudly it says so: a warning unless it is told otherwise. */
  level?: NoticeKind;
}

/** A name for a query nobody named: its first line, shortened to fit the panel. */
export function nameFor(query: string, fallback = "Untitled query"): string {
  const line = query
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return fallback;
  const flat = line.replace(/\s+/g, " ");
  return flat.length > 48 ? `${flat.slice(0, 47)}…` : flat;
}

/**
 * Whether a tab holds edits to the query it was opened from. A tab that came from nowhere is
 * never unsaved: there is nothing for it to differ from.
 */
export function unsaved(tab: { query: string; savedQueryId?: string }, queries: SavedQuery[]): boolean {
  if (!tab.savedQueryId) return false;
  const saved = queries.find((q) => q.id === tab.savedQueryId);
  return !!saved && saved.query !== tab.query;
}

/** Newest first, and a save of something already saved replaces it where it stands. */
export function upsert(queries: SavedQuery[], entry: SavedQuery): SavedQuery[] {
  return queries.some((q) => q.id === entry.id) ? queries.map((q) => (q.id === entry.id ? entry : q)) : [entry, ...queries];
}

/**
 * The line joins the history once: running the same query again moves it up rather than
 * repeating it, which is what makes the list readable after an afternoon.
 */
export function remember<T extends { query: string; streamLabel: string }>(history: T[], entry: T, limit = 100): T[] {
  const same = (h: T) => h.query.trim() === entry.query.trim() && h.streamLabel === entry.streamLabel;
  return [entry, ...history.filter((h) => !same(h))].slice(0, limit);
}

/** How often a watched query looks: its own answer, or the one the settings give. 0 is off. */
export function watchEvery(query: { watch?: boolean; watchSeconds?: number }, fallback: number): number {
  if (!query.watch) return 0;
  return Math.max(0, query.watchSeconds ?? fallback);
}

/** The sounds macOS ships with, which is what the notification can name. */
export const SOUNDS = ["Ping", "Glass", "Blow", "Bottle", "Funk", "Hero", "Morse", "Pop", "Purr", "Sosumi", "Submarine", "Tink", "Basso"];

/**
 * How an alert announces itself outside the window. Info is left silent whatever sound is
 * chosen: something worth a sound is something worth stopping for, and a stream that hums
 * along is neither.
 */
export function alarm(level: NoticeKind = "warning", sound = "Ping"): { mark: string; sound?: string } {
  const heard = sound && sound !== "none" ? sound : undefined;
  if (level === "error") return { mark: "🛑", sound: heard };
  if (level === "info") return { mark: "ℹ️" };
  return { mark: "⚠️", sound: heard };
}

/** Whether a round is owed, given when the last one was. */
export function due(last: number | undefined, now: number, seconds: number): boolean {
  if (seconds <= 0) return false;
  return last === undefined || now - last >= seconds * 1000;
}

let store: Store | undefined;
async function file(): Promise<Store> {
  store ??= await load(QUERIES_FILE, { autoSave: false });
  return store;
}

export async function loadQueries(folder?: string): Promise<SavedQuery[]> {
  try {
    const saved = folder
      ? await readWorkspaceFile<{ format: number; queries: SavedQuery[] }>(folder, QUERIES_FILE)
      : await (await file()).get<{ format: number; queries: SavedQuery[] }>("queries");
    return saved?.format === FORMAT ? (saved.queries ?? []) : [];
  } catch {
    return [];
  }
}

export async function saveQueries(queries: SavedQuery[], folder?: string): Promise<void> {
  const value = { format: FORMAT, queries };
  if (folder) return writeWorkspaceFile(folder, QUERIES_FILE, value);
  const s = await file();
  await s.set("queries", value);
  await s.save();
}
