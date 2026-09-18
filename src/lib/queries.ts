// Queries worth keeping. They describe the work rather than the machine, so a workspace keeps
// its own in `<folder>/.flux/queries.json` and a window with no workspace open keeps them in
// the config directory beside the other authored files. Opening a folder therefore swaps the
// list along with everything else that folder remembers.
import { load, type Store } from "@tauri-apps/plugin-store";
import { readWorkspaceFile, writeWorkspaceFile } from "./workspaces";

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
