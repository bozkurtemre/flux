// A workspace is a folder you opened. Its own settings live in `.flux` inside it, the way an
// IDE keeps `.idea`; connections stay where they are, because they carry tokens and a folder
// that is usually a git checkout is the last place those belong (docs/adr/0006).
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "./settings";

/** What a workspace holds, kept in `<folder>/.flux/workspace.json`. */
export interface WorkspaceFile {
  format: number;
  /** Which of the global connections this workspace works with. Empty means all of them. */
  connectionIds: string[];
  /** Stream grouping belongs to the work, not to the machine, so it lives here. */
  projects: Project[];
}

export interface Recent {
  folder: string;
  /** Seconds since the epoch, so the list can be ordered by when you were last in it. */
  openedAt: number;
}

export const WORKSPACE_FILE = "workspace.json";
export const SESSION_FILE = "session.json";
export const FORMAT = 1;

/** The name a folder is known by: its last segment, which is what the IDE shows too. */
export function workspaceName(folder: string): string {
  const parts = folder.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || folder;
}

/** `~/src/flux` reads better than the whole path, and is what the menu has room for. */
export function shortPath(folder: string, home: string): string {
  return home && folder.startsWith(home) ? `~${folder.slice(home.length)}` : folder;
}

/**
 * The recent list, newest first: opening a folder moves it to the top rather than repeating
 * it, and the list is capped so the menu stays a menu.
 */
export function remember(recents: Recent[], folder: string, at: number, limit = 8): Recent[] {
  return [{ folder, openedAt: at }, ...recents.filter((r) => r.folder !== folder)].slice(0, limit);
}

/**
 * Which connections a workspace shows. An empty selection means all of them: a folder opened
 * for the first time should show what the window already showed, not an empty tree.
 */
export function chosenConnections<T extends { id: string }>(connections: T[], chosen: string[]): T[] {
  if (!chosen.length) return connections;
  return connections.filter((c) => chosen.includes(c.id));
}

export async function readWorkspaceFile<T>(folder: string, file: string): Promise<T | null> {
  const text = await invoke<string | null>("workspace_read", { folder, file });
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function writeWorkspaceFile(folder: string, file: string, value: unknown): Promise<void> {
  await invoke("workspace_write", { folder, file, contents: JSON.stringify(value, null, 2) });
}
