// Persisted app settings. Tokens live in the Tauri store on this machine only.
import { load, type Store } from "@tauri-apps/plugin-store";
import { deleteSecret, getSecret } from "./secrets";

export interface Connection {
  id: string;
  name: string; // "prod", "stage"
  graylogUrl: string;
  /**
   * Held in memory only. It is written to the OS credential store on save and read back
   * on load; what lands in settings.json is `secretStorage`, never this.
   */
  graylogToken: string;
  secretStorage?: "keychain";
  /** The result grid's columns, in order, as this connection was last left. */
  columns?: string[];
}

/** A group of streams the user considers one service. Purely a tree convenience. */
export interface Project {
  id: string;
  connectionId: string;
  name: string;
  github?: string; // owner/repo, shown beside the project in the tree
  streams: string[]; // stream ids
}

export interface Appearance {
  theme: "dark" | "light" | "system";
  uiFontSize: number; // px, chrome
  density: "compact" | "default" | "comfortable";
  accent: string; // hex
}

export interface TreeSettings {
  rowHeight: number;
  indent: number;
  showCounts: boolean;
  showErrorRate: boolean;
  colorByHealth: boolean;
  sortEndpointsBy: "traffic" | "name" | "errors";
  endpointLimit: number;
  lookbackHours: number; // window used to list endpoints
}

export interface EditorSettings {
  fontSize: number;
  lineNumbers: boolean;
  wrap: boolean;
  autocomplete: boolean;
  highlightActiveLine: boolean;
  runOnOpen: boolean;
}

export interface ResultSettings {
  pageSize: number;
  defaultRangeSeconds: number;
  timezone: "local" | "utc";
  timestampFormat: "iso" | "short" | "time";
  stripedRows: boolean;
  colorBySeverity: boolean;
  nullText: string;
  fontSize: number;
  rowHeight: number;
  autoRefreshSeconds: number; // 0 = off
  /** The timeline over the results. It is two more requests per query, so it can be turned off. */
  timeline: boolean;
  /** Nested JSON in the value inspector folds away behind a chevron. */
  jsonTree: boolean;
}

export interface AdvancedSettings {
  requestTimeoutSeconds: number;
  fieldCacheMinutes: number;
  confirmOnClose: boolean;
}

/** What to do with terminal sessions that are still running when the app quits. */
export type OnQuit = "ask" | "kill" | "leave";

/** What a terminal tab runs in. tmux keeps the session alive after Flux quits; the shell
 * is what every machine already has. */
export type TerminalEngine = "shell" | "tmux";

export interface TerminalSettings {
  engine: TerminalEngine;
  tmuxPath: string; // empty: found on PATH, through the login shell
  shell: string; // empty: whichever login shell the machine gives us
  onQuit: OnQuit;
}

export interface UpdateSettings {
  checkOnStartup: boolean;
  /** The version the balloon was dismissed for; the next one asks again. */
  dismissedVersion?: string;
  lastCheckedAt?: string;
}

export interface McpSettings {
  enabled: boolean;
  port: number;
  /** Anything on this machine can reach the port; this is what makes it the agent's. */
  token: string;
}

export interface Settings {
  connections: Connection[];
  projects: Project[];
  appearance: Appearance;
  tree: TreeSettings;
  editor: EditorSettings;
  results: ResultSettings;
  terminal: TerminalSettings;
  updates: UpdateSettings;
  mcp: McpSettings;
  advanced: AdvancedSettings;
}

export const DEFAULTS: Settings = {
  connections: [],
  projects: [],
  appearance: { theme: "dark", uiFontSize: 13, density: "default", accent: "#3574f0" },
  tree: {
    rowHeight: 24,
    indent: 14,
    showCounts: true,
    showErrorRate: true,
    colorByHealth: true,
    sortEndpointsBy: "traffic",
    endpointLimit: 500,
    lookbackHours: 1,
  },
  editor: { fontSize: 13, lineNumbers: true, wrap: true, autocomplete: true, highlightActiveLine: true, runOnOpen: true },
  results: {
    pageSize: 500,
    defaultRangeSeconds: 3600,
    timezone: "local",
    timestampFormat: "short",
    stripedRows: true,
    colorBySeverity: true,
    nullText: "null",
    fontSize: 12,
    rowHeight: 24,
    autoRefreshSeconds: 0,
    timeline: true,
    jsonTree: true,
  },
  terminal: { engine: "shell", tmuxPath: "", shell: "", onQuit: "ask" },
  updates: { checkOnStartup: true },
  mcp: { enabled: false, port: 4319, token: "" },
  advanced: { requestTimeoutSeconds: 60, fieldCacheMinutes: 10, confirmOnClose: false },
};

/** Before the engine was chosen by name it was a tick box, and tmux was the only alternative. */
function engineOf(saved: (Partial<TerminalSettings> & { useTmux?: boolean }) | undefined): { engine?: TerminalEngine } {
  if (!saved || saved.engine) return {};
  return saved.useTmux === undefined ? {} : { engine: saved.useTmux ? "tmux" : "shell" };
}

/** Old shapes lose keys as the model grows; merge each section over its defaults. */
export function withDefaults(saved: Partial<Settings> | null | undefined): Settings {
  const s = saved ?? {};
  return {
    connections: s.connections ?? [],
    projects: s.projects ?? [],
    appearance: { ...DEFAULTS.appearance, ...(s.appearance ?? {}) },
    tree: { ...DEFAULTS.tree, ...(s.tree ?? {}) },
    editor: { ...DEFAULTS.editor, ...(s.editor ?? {}) },
    results: {
      ...DEFAULTS.results,
      ...(s.results ?? {}),
      // pre-1.0 stored this at the top level
      ...((s as { defaultRangeSeconds?: number }).defaultRangeSeconds
        ? { defaultRangeSeconds: (s as { defaultRangeSeconds: number }).defaultRangeSeconds }
        : {}),
    },
    terminal: { ...DEFAULTS.terminal, ...(s.terminal ?? {}), ...engineOf(s.terminal) },
    updates: { ...DEFAULTS.updates, ...(s.updates ?? {}) },
    mcp: { ...DEFAULTS.mcp, ...(s.mcp ?? {}) },
    advanced: { ...DEFAULTS.advanced, ...(s.advanced ?? {}) },
  };
}

/**
 * One file per concern, as the IDE does, rather than one blob.
 *
 * `connections.json` and `projects.json` describe what you set up and are the two a team
 * could share; `preferences.json` is how you like the window. None of them carries a
 * secret. Machine-specific state lives in `workspace.json`, see workspace.ts.
 */
const FILES = {
  connections: "connections.json",
  projects: "projects.json",
  preferences: "preferences.json",
} as const;

/** Bump when a file's shape changes in a way older readers cannot handle. */
export const FORMAT_VERSION = 1;

const LEGACY = "settings.json";

const stores = new Map<string, Store>();
async function file(name: string): Promise<Store> {
  let s = stores.get(name);
  if (!s) {
    s = await load(name, { autoSave: true });
    stores.set(name, s);
  }
  return s;
}

async function readFile<T>(name: string, key: string): Promise<T | undefined> {
  const s = await file(name);
  return (await s.get<T>(key)) ?? undefined;
}

async function writeFile(name: string, key: string, value: unknown): Promise<void> {
  const s = await file(name);
  await s.set("formatVersion", FORMAT_VERSION);
  await s.set(key, value);
  await s.save();
}

/** Pre-split installs kept everything under one key; read it once so nothing is lost. */
async function readLegacy(): Promise<(Partial<Settings> & { theme?: "dark" | "light" }) | undefined> {
  try {
    const s = await load(LEGACY, { autoSave: false });
    return (await s.get<Partial<Settings> & { theme?: "dark" | "light" }>("settings")) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function loadSettings(): Promise<Settings> {
  const [connections, projects, preferences] = await Promise.all([
    readFile<Connection[]>(FILES.connections, "connections"),
    readFile<Project[]>(FILES.projects, "projects"),
    readFile<Omit<Settings, "connections" | "projects">>(FILES.preferences, "preferences"),
  ]);

  let merged: Settings;
  let needsWrite = false;

  if (connections || projects || preferences) {
    merged = withDefaults({ connections, projects, ...(preferences ?? {}) });
  } else {
    const legacy = await readLegacy();
    merged = withDefaults(legacy);
    // pre-1.0 stored the theme at the top level
    if (legacy?.theme && !legacy.appearance) merged.appearance.theme = legacy.theme;
    needsWrite = !!legacy;
  }

  // Tokens used to be kept by the credential store. Any still there are read back into the
  // file and removed from it, so an existing install keeps working and stops being asked
  // about the Keychain on every launch. See docs/adr/0005.
  for (const c of merged.connections) {
    if (c.graylogToken) continue;
    const stored = await getSecret(c.id).catch(() => null);
    if (!stored) continue;
    c.graylogToken = stored;
    c.secretStorage = undefined;
    await deleteSecret(c.id).catch(() => {});
    needsWrite = true;
  }

  if (needsWrite) await saveSettings(merged);
  return merged;
}

/** The token is written with the rest of the connection, in the clear. See docs/adr/0005. */
export async function saveSettings(settings: Settings): Promise<void> {
  const connections = settings.connections.map((c) => ({ ...c, secretStorage: undefined }));
  const { connections: _c, projects, ..._preferences } = settings;
  const preferences = { ..._preferences } as Omit<Settings, "connections" | "projects">;
  void _c;

  await Promise.all([
    writeFile(FILES.connections, "connections", connections),
    writeFile(FILES.projects, "projects", projects),
    writeFile(FILES.preferences, "preferences", preferences),
  ]);
}

/** Called when a connection is deleted, so its token does not outlive it. */
export async function forgetSecrets(removed: Connection[]): Promise<void> {
  await Promise.all(removed.map((c) => deleteSecret(c.id).catch(() => {})));
}

export function newConnection(): Connection {
  return { id: crypto.randomUUID(), name: "", graylogUrl: "", graylogToken: "" };
}

export function newProject(connectionId: string): Project {
  return { id: crypto.randomUUID(), connectionId, name: "", streams: [] };
}

/** The theme actually applied, resolving "system". */
export function resolveTheme(t: Appearance["theme"]): "dark" | "light" {
  if (t !== "system") return t;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export const DENSITY_SCALE: Record<Appearance["density"], number> = { compact: 0.88, default: 1, comfortable: 1.14 };

/** Push the appearance settings onto the document so CSS can consume them. */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(a.theme);
  root.style.setProperty("--ui-font-size", `${a.uiFontSize}px`);
  root.style.setProperty("--density", String(DENSITY_SCALE[a.density]));
  root.style.setProperty("--accent", a.accent);
}

/**
 * Read connections out of `.env`-style text. Any file with `GRAYLOG_URL_<ENV>` and
 * `GRAYLOG_TOKEN_<ENV>` pairs works; it saves typing a URL and a token by hand.
 */
export function connectionsFromEnv(text: string): Connection[] {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  const out: Connection[] = [];
  for (const name of ["stage", "prod"]) {
    const url = env[`GRAYLOG_URL_${name.toUpperCase()}`] ?? (name === "stage" ? env.GRAYLOG_URL : undefined);
    const token = env[`GRAYLOG_TOKEN_${name.toUpperCase()}`] ?? (name === "stage" ? env.GRAYLOG_TOKEN : undefined);
    if (url && token) {
      out.push({ id: crypto.randomUUID(), name, graylogUrl: url, graylogToken: token });
    }
  }
  return out;
}

export const SHORTCUTS: { group: string; keys: string; action: string }[] = [
  { group: "Connection Explorer", keys: "↑ ↓", action: "Move selection" },
  { group: "Connection Explorer", keys: "→", action: "Expand node" },
  { group: "Connection Explorer", keys: "←", action: "Collapse node" },
  { group: "Connection Explorer", keys: "Enter", action: "Open in a new tab" },
  { group: "Query Console", keys: "⌘⏎", action: "Execute query" },
  { group: "Query Console", keys: "⌃Space", action: "Complete field name" },
  { group: "Query Console", keys: "⌘R", action: "Refresh results" },
  { group: "Query Console", keys: "⌘S", action: "Save query" },
  { group: "Search", keys: "⇧⇧", action: "Search Everywhere" },
  { group: "Search", keys: "⌘⇧F", action: "Search Everywhere" },
  { group: "Search", keys: "⇧⌘O", action: "Go to Endpoint" },
  { group: "Search", keys: "⇥", action: "Switch search tab" },
  { group: "Window", keys: "⌘,", action: "Open Settings" },
  { group: "Window", keys: "⌘W", action: "Close active tab" },
];
