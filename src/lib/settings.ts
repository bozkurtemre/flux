// Persisted app settings. Tokens live in the Tauri store on this machine only.
import { load, type Store } from "@tauri-apps/plugin-store";

export interface Connection {
  id: string;
  name: string; // "prod", "stage"
  graylogUrl: string;
  graylogToken: string;
  mongoUri?: string; // optional watchdog database, for endpoint lists and history
  configPath?: string; // optional watchdog.config.yaml, for project grouping
  env?: string; // which `env` value the watchdog data uses; defaults to `name`
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
}

export interface AdvancedSettings {
  requestTimeoutSeconds: number;
  fieldCacheMinutes: number;
  confirmOnClose: boolean;
}

export interface Settings {
  connections: Connection[];
  appearance: Appearance;
  tree: TreeSettings;
  editor: EditorSettings;
  results: ResultSettings;
  advanced: AdvancedSettings;
}

export const DEFAULTS: Settings = {
  connections: [],
  appearance: { theme: "dark", uiFontSize: 13, density: "default", accent: "#3574f0" },
  tree: {
    rowHeight: 24,
    indent: 14,
    showCounts: true,
    showErrorRate: true,
    colorByHealth: true,
    sortEndpointsBy: "traffic",
    endpointLimit: 500,
    lookbackHours: 24,
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
  },
  advanced: { requestTimeoutSeconds: 60, fieldCacheMinutes: 10, confirmOnClose: false },
};

/** Old shapes lose keys as the model grows; merge each section over its defaults. */
export function withDefaults(saved: Partial<Settings> | null | undefined): Settings {
  const s = saved ?? {};
  return {
    connections: s.connections ?? [],
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
    advanced: { ...DEFAULTS.advanced, ...(s.advanced ?? {}) },
  };
}

let store: Store | undefined;

async function get(): Promise<Store> {
  store ??= await load("settings.json", { autoSave: true });
  return store;
}

export async function loadSettings(): Promise<Settings> {
  const s = await get();
  const saved = await s.get<Partial<Settings> & { theme?: "dark" | "light" }>("settings");
  const merged = withDefaults(saved);
  // pre-1.0 stored the theme at the top level
  if (saved?.theme && !saved.appearance) merged.appearance.theme = saved.theme;
  return merged;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const s = await get();
  await s.set("settings", settings);
  await s.save();
}

export function newConnection(): Connection {
  return { id: crypto.randomUUID(), name: "", graylogUrl: "", graylogToken: "" };
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

/** `.env`-style text to a connection pair, for importing a watchdog setup. */
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
      out.push({
        id: crypto.randomUUID(),
        name,
        graylogUrl: url,
        graylogToken: token,
        env: name,
        mongoUri: env.MONGODB_URI?.replace("mongodb://mongo:", "mongodb://localhost:"),
      });
    }
  }
  return out;
}

export const SHORTCUTS: { group: string; keys: string; action: string }[] = [
  { group: "Database Explorer", keys: "↑ ↓", action: "Move selection" },
  { group: "Database Explorer", keys: "→", action: "Expand node" },
  { group: "Database Explorer", keys: "←", action: "Collapse node" },
  { group: "Database Explorer", keys: "Enter", action: "Open in a new tab" },
  { group: "Query Console", keys: "⌘⏎", action: "Execute query" },
  { group: "Query Console", keys: "⌃Space", action: "Complete field name" },
  { group: "Search", keys: "⇧⇧", action: "Search Everywhere" },
  { group: "Search", keys: "⌘⇧F", action: "Search Everywhere" },
  { group: "Search", keys: "⇧⌘O", action: "Go to Endpoint" },
  { group: "Search", keys: "⇥", action: "Switch search tab" },
  { group: "Window", keys: "⌘,", action: "Open Settings" },
  { group: "Window", keys: "⌘W", action: "Close active tab" },
];
