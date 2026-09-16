// What you had open, as opposed to how you have things configured. This file belongs to
// one machine and is never worth sharing, which is exactly why the IDE keeps its
// equivalent out of the shareable settings.
import { load, type Store } from "@tauri-apps/plugin-store";
import type { EndpointRow } from "./endpoints";

const FILE = "workspace.json";
const FORMAT = 1;

/** A tab without its results: those are re-run, never restored from disk. */
export interface SavedTab {
  id: string;
  title: string;
  connId: string;
  streamIds: string[];
  streamLabel: string;
  endpoint?: EndpointRow;
  query: string;
  rangeSeconds: number;
  columns: string[];
}

export interface Workspace {
  format: number;
  expanded: Record<string, boolean>;
  selectedNode?: string;
  tabs: SavedTab[];
  activeTab?: string;
}

const empty: Workspace = { format: FORMAT, expanded: {}, tabs: [] };

let store: Store | undefined;
async function file(): Promise<Store> {
  store ??= await load(FILE, { autoSave: false });
  return store;
}

export async function loadWorkspace(): Promise<Workspace> {
  try {
    const saved = await (await file()).get<Workspace>("workspace");
    // a format bump discards rather than migrates; nothing here is worth a migration
    return saved?.format === FORMAT ? { ...empty, ...saved } : empty;
  } catch {
    return empty;
  }
}

let pending: ReturnType<typeof setTimeout> | undefined;

/**
 * Saved on a short delay: expanding a tree or typing in a console would otherwise write
 * the file on every keystroke.
 */
export function saveWorkspace(w: Omit<Workspace, "format">): void {
  clearTimeout(pending);
  pending = setTimeout(() => {
    void (async () => {
      try {
        const s = await file();
        await s.set("workspace", { format: FORMAT, ...w });
        await s.save();
      } catch {
        /* losing the layout is not worth surfacing */
      }
    })();
  }, 400);
}
