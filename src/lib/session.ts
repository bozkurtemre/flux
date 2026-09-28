// What you had open, as opposed to how you have things configured. It belongs to one machine
// and is never worth sharing. Where it is written depends on whether a workspace is open: in
// the workspace's own `.flux` directory when there is one, in the config directory when there
// is not — so switching folders switches what is on screen with them.
import { load, type Store } from "@tauri-apps/plugin-store";
import type { EndpointRow } from "./endpoints";
import { readWorkspaceFile, writeWorkspaceFile, SESSION_FILE } from "./workspaces";

const FILE = "session.json";
const FORMAT = 2;

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
  layout?: string[];
  /** The saved query it was opened from, so the tab still knows after a restart. */
  savedQueryId?: string;
}

/** A terminal tab is its project and its name; the shell behind it is tmux's problem. */
export interface SavedTerminal {
  id: string;
  projectId: string;
  title: string;
}

/** One run of a console, so a query nobody saved can still be found again. */
export interface RanQuery {
  id: string;
  query: string;
  connId: string;
  streamIds: string[];
  streamLabel: string;
  rangeSeconds: number;
  /** Seconds since the epoch, and how many rows came back. */
  at: number;
  rows?: number;
}

export interface Session {
  format: number;
  expanded: Record<string, boolean>;
  selectedNode?: string;
  tabs: SavedTab[];
  activeTab?: string;
  /** Where each project is checked out on this machine, by project id. */
  projectFolders: Record<string, string>;
  terminals: SavedTerminal[];
  activeTerminal?: string;
  showTerminal?: boolean;
  /** Height of the terminal panel, as a percentage of the window. */
  terminalSize?: number;
  /** Width of the value inspector, as a percentage of the results area. */
  inspectorSize?: number;
  /** Width of the saved queries panel, as a percentage of the window. */
  queriesSize?: number;
  /** Which tool window the right dock was showing. `showQueries` is what it was called. */
  rightTool?: "queries" | "notifications" | null;
  showQueries?: boolean;
  /** Whether the fields panel is open under the tree, and how tall it was left. */
  showFields?: boolean;
  fieldsSize?: number;
  /** The queries that were run, newest first. */
  history?: RanQuery[];
}

const empty: Session = { format: FORMAT, expanded: {}, tabs: [], projectFolders: {}, terminals: [] };

let store: Store | undefined;
async function file(): Promise<Store> {
  store ??= await load(FILE, { autoSave: false });
  return store;
}

export async function loadSession(folder?: string): Promise<Session> {
  try {
    const saved = folder ? await readWorkspaceFile<Session>(folder, SESSION_FILE) : await (await file()).get<Session>("workspace");
    // a format bump discards rather than migrates, except the project folders: those were
    // typed in by hand and are the one thing here nobody would thank us for dropping
    return saved?.format === FORMAT ? { ...empty, ...saved } : { ...empty, projectFolders: saved?.projectFolders ?? {} };
  } catch {
    return empty;
  }
}

let pending: ReturnType<typeof setTimeout> | undefined;

/**
 * Saved on a short delay: expanding a tree or typing in a console would otherwise write
 * the file on every keystroke.
 */
export function saveSession(w: Omit<Session, "format">, folder?: string): void {
  clearTimeout(pending);
  pending = setTimeout(() => {
    void (async () => {
      try {
        if (folder) {
          await writeWorkspaceFile(folder, SESSION_FILE, { format: FORMAT, ...w });
          return;
        }
        const s = await file();
        await s.set("workspace", { format: FORMAT, ...w });
        await s.save();
      } catch {
        /* losing the layout is not worth surfacing */
      }
    })();
  }, 400);
}
