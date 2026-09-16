import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Graylog, absolute, setRequestTimeout, type FieldInfo, type MessagePage, type Stream } from "@/lib/graylog";
import { endpointsFromGraylog, sortEndpoints, type EndpointRow } from "@/lib/endpoints";
import * as cache from "@/lib/cache";
import { loadWorkspace, saveWorkspace, type SavedTab } from "@/lib/workspace";
import { killTabCommand } from "@/lib/terminal";
import { withNotice, type Notice, type NoticeKind, type Task } from "@/lib/progress";
import { applyAppearance, DEFAULTS, forgetSecrets, loadSettings, saveSettings, type Connection, type Settings } from "@/lib/settings";

export type NodeKind = "connection" | "project" | "stream" | "endpoint";

export interface TreeNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Only on a project node: the project this stands for, which its name does not identify. */
  projectId?: string;
  sub?: string;
  connId: string;
  streamId?: string;
  endpoint?: EndpointRow;
  depth: number;
  childrenIds?: string[]; // undefined = not loaded yet
  error?: string;
}

export interface Tab {
  id: string;
  title: string;
  connId: string;
  streamIds: string[];
  streamLabel: string;
  endpoint?: EndpointRow;
  query: string;
  rangeSeconds: number;
  running: boolean;
  error?: string;
  page?: MessagePage;
  took?: number;
  fields: FieldInfo[];
  selectedRow?: number;
  columns: string[];
}

/** One view onto a project's terminal session. The shell itself lives in tmux. */
export interface TerminalTab {
  id: string;
  projectId: string;
  title: string;
}

interface State {
  settings: Settings;
  ready: boolean;
  nodes: Record<string, TreeNode>;
  rootIds: string[];
  expanded: Record<string, boolean>;
  loading: Record<string, boolean>;
  selectedNode?: string;
  filter: string;
  tabs: Tab[];
  activeTab?: string;
  showSettings: boolean;
  settingsPage?: string;
  settingsConnId?: string;
  showSearch: boolean;
  terminals: TerminalTab[];
  activeTerminal?: string;
  showTerminal: boolean;
  projectFolders: Record<string, string>;
  /** Set once a tab has had to start without tmux, so quitting stops promising persistence. */
  tmuxMissing: boolean;
  tasks: Task[];
  notices: Notice[];
  searchTab?: string;
  /** Set when settings could not be written, e.g. the credential store refused. */
  settingsError?: string;
  indexing: boolean;

  init: () => Promise<void>;
  setSettings: (s: Settings) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  select: (id: string) => void;
  setFilter: (v: string) => void;
  refresh: (id: string) => Promise<void>;
  openTab: (node: TreeNode) => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  patchTab: (id: string, patch: Partial<Tab>) => void;
  runQuery: (id: string) => Promise<void>;
  setShowSettings: (v: boolean, page?: string, connId?: string) => void;
  setShowSearch: (v: boolean, tab?: string) => void;
  openTerminal: (projectId: string, title: string) => void;
  closeTerminal: (id: string) => void;
  killAllTerminals: () => Promise<void>;
  toggleTerminal: () => void;
  setActiveTerminal: (id: string) => void;
  setProjectFolder: (projectId: string, folder: string) => void;
  setProjectFolders: (folders: Record<string, string>) => void;
  setTmuxMissing: () => void;
  startTask: (title: string, cancel?: () => void) => string;
  setTaskProgress: (id: string, progress: number) => void;
  endTask: (id: string) => void;
  notify: (kind: NoticeKind, title: string, message: string) => void;
  dismissNotice: (id: string) => void;
  indexAll: () => Promise<void>;
  revealNode: (id: string) => void;
  move: (delta: number) => void;
  expandSelected: (open: boolean) => Promise<void>;
  openSelected: () => void;
}

export const DEFAULT_COLUMNS = ["timestamp", "source", "level", "message"];

const clients = new Map<string, Graylog>();
export function clientFor(conn: Connection): Graylog {
  const key = `${conn.id}:${conn.graylogUrl}:${conn.graylogToken}`;
  let c = clients.get(key);
  if (!c) {
    c = new Graylog(conn.graylogUrl, conn.graylogToken);
    clients.set(key, c);
  }
  return c;
}

export const useApp = create<State>((set, get) => ({
  settings: DEFAULTS,
  ready: false,
  nodes: {},
  rootIds: [],
  expanded: {},
  loading: {},
  filter: "",
  tabs: [],
  showSettings: false,
  showSearch: false,
  indexing: false,
  terminals: [],
  showTerminal: false,
  projectFolders: {},
  tmuxMissing: false,
  tasks: [],
  notices: [],

  init: async () => {
    let settings = DEFAULTS;
    let settingsError: string | undefined;
    try {
      settings = await loadSettings();
    } catch (e) {
      // a broken settings file must still leave a usable window
      settingsError = `Settings could not be read: ${(e as Error).message}`;
    }
    set({ ready: true, settingsError });
    await get().setSettings(settings);
    await restoreWorkspace(set, get);
  },

  /**
   * The window reflects the settings first and persists them after. Writing can fail,
   * the credential store in particular can refuse after the app is re-signed, and a
   * failed write must never leave the explorer empty with no explanation.
   */
  setSettings: async (settings) => {
    const gone = get().settings.connections.filter((old) => !settings.connections.some((c) => c.id === old.id));

    applyAppearance(settings.appearance);
    setRequestTimeout(settings.advanced.requestTimeoutSeconds);
    const nodes: Record<string, TreeNode> = {};
    const rootIds: string[] = [];
    for (const c of settings.connections) {
      const id = `c:${c.id}`;
      nodes[id] = { id, kind: "connection", label: c.name || c.graylogUrl, sub: c.graylogUrl, connId: c.id, depth: 0 };
      rootIds.push(id);
    }
    // a project that no longer exists should not leave its folder behind in the workspace
    const folders = Object.fromEntries(Object.entries(get().projectFolders).filter(([id]) => settings.projects.some((p) => p.id === id)));
    const pruned = Object.keys(folders).length !== Object.keys(get().projectFolders).length;
    set({ settings, nodes, rootIds, projectFolders: folders });
    // only when something was actually dropped: init calls this before the workspace has
    // been restored, and an unconditional save there would write the empty state over it
    if (pruned) persist(get);

    try {
      if (gone.length) await forgetSecrets(gone);
      await saveSettings(settings);
      set({ settingsError: undefined });
    } catch (e) {
      set({ settingsError: `Settings not saved: ${(e as Error).message}` });
    }
  },

  setFilter: (filter) => set({ filter }),
  select: (selectedNode) => {
    set({ selectedNode });
    persist(get);
  },
  setShowSettings: (showSettings, settingsPage, settingsConnId) => set({ showSettings, settingsPage, settingsConnId }),
  setShowSearch: (showSearch, searchTab) => set({ showSearch, searchTab }),

  /** A project with nowhere to open sends you to where you say where it lives. */
  openTerminal: (projectId, title) => {
    if (!get().projectFolders[projectId]) {
      get().setShowSettings(true, "projects");
      return;
    }
    const tab: TerminalTab = { id: crypto.randomUUID(), projectId, title };
    set({ terminals: [...get().terminals, tab], activeTerminal: tab.id, showTerminal: true });
    persist(get);
  },

  /** Closing on purpose ends the shell; hiding the panel does not. */
  closeTerminal: (id) => {
    const tab = get().terminals.find((t) => t.id === id);
    const terminals = get().terminals.filter((t) => t.id !== id);
    const activeTerminal = get().activeTerminal === id ? terminals[terminals.length - 1]?.id : get().activeTerminal;
    set({ terminals, activeTerminal });
    // the pty belongs to the view, which closes it as it unmounts; the window is ours
    if (tab) {
      const kill = killTabCommand(get().settings.terminal, tab.projectId, tab.id);
      if (kill) void invoke("terminal_run", { program: kill.program, args: kill.args }).catch(() => {});
    }
    persist(get);
  },

  /** Every session at once, for the question asked when the app is closing. */
  killAllTerminals: async () => {
    const { terminals, settings } = get();
    await Promise.all(
      terminals.map(async (t) => {
        const kill = killTabCommand(settings.terminal, t.projectId, t.id);
        if (kill) await invoke("terminal_run", { program: kill.program, args: kill.args }).catch(() => {});
      }),
    );
    // the workspace still lists them otherwise, and the next launch reopens what was closed
    set({ terminals: [], activeTerminal: undefined });
    persist(get);
  },

  toggleTerminal: () => {
    set({ showTerminal: !get().showTerminal });
    persist(get);
  },

  setActiveTerminal: (id) => {
    set({ activeTerminal: id });
    persist(get);
  },

  setTmuxMissing: () => set({ tmuxMissing: true }),

  startTask: (title, cancel) => {
    const id = crypto.randomUUID();
    set({ tasks: [...get().tasks, { id, title, cancel }] });
    return id;
  },
  setTaskProgress: (id, progress) => set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, progress } : t)) }),
  endTask: (id) => set({ tasks: get().tasks.filter((t) => t.id !== id) }),

  notify: (kind, title, message) => set({ notices: withNotice(get().notices, { id: crypto.randomUUID(), kind, title, message }) }),
  dismissNotice: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),

  setProjectFolders: (projectFolders) => {
    set({ projectFolders });
    persist(get);
  },

  setProjectFolder: (projectId, folder) => {
    const projectFolders = { ...get().projectFolders };
    if (folder) projectFolders[projectId] = folder;
    else delete projectFolders[projectId];
    set({ projectFolders });
    persist(get);
  },

  /**
   * Fill the node map for every connection, project and stream without expanding anything,
   * so Search Everywhere can match endpoints the tree has not shown yet.
   */
  indexAll: async () => {
    if (get().indexing) return;
    set({ indexing: true });
    let cancelled = false;
    const task = get().startTask("Indexing streams and endpoints", () => {
      cancelled = true;
    });
    try {
      for (const id of get().rootIds) {
        if (cancelled) return;
        if (get().nodes[id]?.childrenIds === undefined) await loadChildren(id, set, get);
        for (const childId of get().nodes[id]?.childrenIds ?? []) {
          if (cancelled) return;
          const child = get().nodes[childId];
          if (child?.kind === "project" && child.childrenIds === undefined) await loadChildren(childId, set, get);
        }
      }
      // streams can sit under a project or directly under a connection
      const streams = Object.values(get().nodes).filter((n) => n.kind === "stream" && n.childrenIds === undefined);
      // still in parallel, as it was: the count rises as each one lands rather than in turn,
      // so the bar stays honest without making the slow part slower
      let done = 0;
      await Promise.all(
        streams.map(async (n) => {
          await loadChildren(n.id, set, get);
          get().setTaskProgress(task, ++done / streams.length);
        }),
      );
    } finally {
      get().endTask(task);
      set({ indexing: false });
    }
  },

  /** Select a node and open every ancestor so it is visible in the tree. */
  revealNode: (id) => {
    const { nodes } = get();
    const expanded = { ...get().expanded };
    for (const n of Object.values(nodes)) {
      if (n.childrenIds?.includes(id)) {
        expanded[n.id] = true;
        for (const m of Object.values(nodes)) if (m.childrenIds?.includes(n.id)) expanded[m.id] = true;
      }
    }
    set({ expanded, selectedNode: id });
  },

  toggle: async (id) => {
    const { expanded, nodes } = get();
    const node = nodes[id];
    if (!node || node.kind === "endpoint") return;
    const open = !expanded[id];
    set({ expanded: { ...expanded, [id]: open } });
    persist(get);
    if (open && node.childrenIds === undefined) await loadChildren(id, set, get);
  },

  refresh: async (id) => {
    const node = get().nodes[id];
    if (!node) return;
    set({ nodes: { ...get().nodes, [id]: { ...node, childrenIds: undefined, error: undefined } } });
    await loadChildren(id, set, get, true);
  },

  openTab: (node) => {
    const { tabs, settings } = get();
    const existing = tabs.find((t) => t.id === node.id);
    if (existing) return set({ activeTab: existing.id });
    const conn = settings.connections.find((c) => c.id === node.connId);
    if (!conn) return;

    const streamIds = node.kind === "endpoint" || node.kind === "stream" ? [node.streamId!] : [];
    const parentLabel = node.kind === "endpoint" ? (get().nodes[`s:${node.connId}:${node.streamId}`]?.label ?? "") : node.label;
    const tab: Tab = {
      id: node.id,
      title: node.kind === "endpoint" ? `${node.endpoint?.method ?? ""} ${node.label}`.trim() : node.label,
      connId: node.connId,
      streamIds,
      streamLabel: parentLabel,
      endpoint: node.endpoint,
      query: "",
      rangeSeconds: settings.results.defaultRangeSeconds,
      running: false,
      fields: [],
      columns: DEFAULT_COLUMNS,
    };
    set({ tabs: [...tabs, tab], activeTab: tab.id });
    persist(get);
    void loadFields(tab.id, set, get);
    if (settings.editor.runOnOpen) void get().runQuery(tab.id);
  },

  closeTab: (id) => {
    const { tabs, activeTab } = get();
    const rest = tabs.filter((t) => t.id !== id);
    set({ tabs: rest, activeTab: activeTab === id ? rest[rest.length - 1]?.id : activeTab });
    persist(get);
  },

  setActive: (activeTab) => {
    set({ activeTab });
    persist(get);
  },

  patchTab: (id, patch) => {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    // only the parts worth reopening with
    if ("query" in patch || "rangeSeconds" in patch || "columns" in patch) persist(get);
  },

  /** Arrow-key navigation over the flattened visible rows, as in the IDE tree. */
  move: (delta) => {
    const rows = visibleRows(get());
    if (!rows.length) return;
    const i = rows.findIndex((r) => r.id === get().selectedNode);
    const next = rows[Math.max(0, Math.min(rows.length - 1, (i < 0 ? 0 : i) + delta))];
    if (next) set({ selectedNode: next.id });
  },

  expandSelected: async (open) => {
    const { selectedNode, nodes, expanded, toggle, move } = get();
    if (!selectedNode) return;
    const node = nodes[selectedNode];
    if (!node) return;
    if (open) {
      if (node.kind !== "endpoint" && !expanded[selectedNode]) await toggle(selectedNode);
      else move(1);
    } else if (expanded[selectedNode]) {
      await toggle(selectedNode);
    } else {
      move(-1);
    }
  },

  openSelected: () => {
    const { selectedNode, nodes, openTab } = get();
    const node = selectedNode ? nodes[selectedNode] : undefined;
    if (node && (node.kind === "endpoint" || node.kind === "stream")) openTab(node);
  },

  runQuery: async (id) => {
    const { tabs, settings, patchTab } = get();
    const tab = tabs.find((t) => t.id === id);
    const conn = settings.connections.find((c) => c.id === tab?.connId);
    if (!tab || !conn) return;
    patchTab(id, { running: true, error: undefined });
    const task = get().startTask(`Running the query on ${tab.streamLabel}`);
    const started = performance.now();
    try {
      const clauses = [tab.query.trim()].filter(Boolean);
      if (tab.endpoint) clauses.push(endpointClause(tab.endpoint));
      const to = new Date();
      const page = await clientFor(conn).messages({
        query: clauses.length ? clauses.map((c) => `(${c})`).join(" AND ") : "*",
        streams: tab.streamIds,
        timerange: absolute(new Date(to.getTime() - tab.rangeSeconds * 1000), to),
        fields: columnsForQuery(tab),
        size: settings.results.pageSize,
      });
      patchTab(id, { page, took: Math.round(performance.now() - started), running: false, selectedRow: undefined });
    } catch (e) {
      patchTab(id, { error: (e as Error).message, running: false, page: undefined });
      get().notify("error", conn.name || conn.graylogUrl, (e as Error).message);
    } finally {
      get().endTask(task);
    }
  },
}));

/** Ask Graylog for the fields the tab's stream actually has, for the grid and autocomplete. */
async function loadFields(tabId: string, set: Setter, get: Getter) {
  const tab = get().tabs.find((t) => t.id === tabId);
  const conn = get().settings.connections.find((c) => c.id === tab?.connId);
  if (!tab || !conn || !tab.streamIds.length) return;
  try {
    const cached = (await cache.load(cache.cacheKey(conn.id))).byStream[tab.streamIds[0]];
    if (cached?.fields.length) get().patchTab(tabId, { fields: cached.fields });
    const fields = await clientFor(conn).fields(tab.streamIds[0]);
    get().patchTab(tabId, { fields });
  } catch {
    /* fields are a convenience; the grid still works without them */
  }
  void set;
}

function columnsForQuery(tab: Tab): string[] {
  const wanted = new Set([...tab.columns, "timestamp", "gl2_message_id"]);
  if (tab.fields.length) for (const f of tab.fields) if (wanted.has(f.name)) wanted.add(f.name);
  return [...wanted];
}

/** Restrict a search to one endpoint. Templates carry `:id` placeholders, so match the literal prefix. */
export function endpointClause(ep: EndpointRow): string {
  const literal = ep.endpoint.split("/:")[0];
  const field = "route";
  const value = literal && literal !== "" ? literal : ep.endpoint;
  const escaped = value.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, "\\$1");
  return ep.endpoint.includes("/:") ? `${field}:${escaped}*` : `${field}:"${value}"`;
}

type Setter = (partial: Partial<State> | ((s: State) => Partial<State>)) => void;
type Getter = () => State;

const savedShape = (t: Tab): SavedTab => ({
  id: t.id,
  title: t.title,
  connId: t.connId,
  streamIds: t.streamIds,
  streamLabel: t.streamLabel,
  endpoint: t.endpoint,
  query: t.query,
  rangeSeconds: t.rangeSeconds,
  columns: t.columns,
});

function persist(get: Getter) {
  const { expanded, selectedNode, tabs, activeTab, terminals, activeTerminal, showTerminal, projectFolders } = get();
  saveWorkspace({
    expanded,
    selectedNode,
    tabs: tabs.map(savedShape),
    activeTab,
    terminals,
    activeTerminal,
    showTerminal,
    projectFolders,
  });
}

/**
 * Reopen what was open. Tabs come back with their query and range but no results, so the
 * active one re-runs and the rest wait until they are looked at, as the IDE does.
 */
async function restoreWorkspace(set: Setter, get: Getter) {
  const w = await loadWorkspace();
  // terminals come back before the early return below: a window with only a terminal open
  // is a perfectly ordinary way to have left the app
  const projects = new Set(get().settings.projects.map((p) => p.id));
  const terminals = w.terminals.filter((t) => projects.has(t.projectId));
  set({
    projectFolders: w.projectFolders,
    terminals,
    activeTerminal: terminals.some((t) => t.id === w.activeTerminal) ? w.activeTerminal : terminals[0]?.id,
    showTerminal: !!w.showTerminal && terminals.length > 0,
  });

  const live = new Set(get().settings.connections.map((c) => c.id));
  const tabs: Tab[] = w.tabs
    .filter((t) => live.has(t.connId))
    .map((t) => ({ ...t, running: false, fields: [], columns: t.columns?.length ? t.columns : DEFAULT_COLUMNS }));
  if (!tabs.length && !Object.keys(w.expanded).length) return;

  const activeTab = tabs.some((t) => t.id === w.activeTab) ? w.activeTab : tabs[tabs.length - 1]?.id;
  set({ tabs, activeTab, selectedNode: w.selectedNode });

  // re-open the branches that were open, which also refills them from the cache
  for (const id of Object.keys(w.expanded).filter((k) => w.expanded[k])) {
    if (get().nodes[id]) await get().toggle(id);
  }
  if (activeTab) {
    void loadFields(activeTab, set, get);
    void get().runQuery(activeTab);
  }
}

async function loadChildren(id: string, set: Setter, get: Getter, force = false) {
  const node = get().nodes[id];
  const conn = get().settings.connections.find((c) => c.id === node.connId);
  if (!node || !conn) return;
  set({ loading: { ...get().loading, [id]: true } });
  const task = get().startTask(node.kind === "connection" ? `Connecting to ${conn.name || conn.graylogUrl}` : `Loading ${node.label}`);
  try {
    const made =
      node.kind === "connection"
        ? await connectionChildren(node, conn, force)
        : node.kind === "project"
          ? await projectChildren(node, get)
          : await streamChildren(node, conn, force);
    const nodes = { ...get().nodes };
    for (const n of made) nodes[n.id] = { ...(nodes[n.id] ?? {}), ...n };
    nodes[id] = { ...nodes[id], childrenIds: made.map((n) => n.id), error: undefined };
    set({ nodes });
  } catch (e) {
    set({ nodes: { ...get().nodes, [id]: { ...node, childrenIds: [], error: (e as Error).message } } });
    get().notify("error", conn.name || conn.graylogUrl, (e as Error).message);
  } finally {
    get().endTask(task);
    set({ loading: { ...get().loading, [id]: false } });
  }
}

/**
 * Connection children: the projects the user defined, then any stream no project claims.
 * Streams come from the cache first so the tree opens instantly, and refresh behind it.
 */
async function connectionChildren(node: TreeNode, conn: Connection, force: boolean): Promise<TreeNode[]> {
  const cached = await cache.load(cache.cacheKey(conn.id));
  let streams = cached.streams;
  if (force || !streams.length) {
    streams = await clientFor(conn).streams();
    await cache.putStreams(cache.cacheKey(conn.id), streams);
  } else {
    // warm the cache for next time without making this expansion wait
    void clientFor(conn)
      .streams()
      .then((fresh) => cache.putStreams(cache.cacheKey(conn.id), fresh))
      .catch(() => {});
  }

  const byId = new Map(streams.map((s) => [s.id, s]));
  const projects = useApp.getState().settings.projects.filter((p) => p.connectionId === conn.id);

  const out: TreeNode[] = [];
  const claimed = new Set<string>();
  for (const p of projects) {
    const owned = p.streams.filter((s) => byId.has(s));
    if (!owned.length) continue;
    owned.forEach((s) => claimed.add(s));
    out.push({
      id: `p:${conn.id}:${p.name}`,
      kind: "project",
      projectId: p.id,
      label: p.name,
      sub: p.github,
      connId: conn.id,
      depth: 1,
      childrenIds: undefined,
      streamId: owned.join(","), // stashed for projectChildren
    });
  }
  for (const s of streams.filter((s) => !claimed.has(s.id))) out.push(streamNode(s, conn.id, 1));
  void node;
  return out;
}

/** Streams a project claims. Titles come from the cached stream list, never the bare id. */
async function projectChildren(node: TreeNode, get: Getter): Promise<TreeNode[]> {
  const conn = get().settings.connections.find((c) => c.id === node.connId)!;
  const ids = (node.streamId ?? "").split(",").filter(Boolean);
  const byId = new Map((await cache.load(cache.cacheKey(conn.id))).streams.map((st) => [st.id, st]));
  const known = get().nodes;
  return ids.map((sid) => {
    const existing = known[`s:${conn.id}:${sid}`];
    if (existing) return { ...existing, depth: 2 };
    const st = byId.get(sid);
    return streamNode(st ?? { id: sid, title: sid, disabled: false }, conn.id, 2);
  });
}

function streamNode(s: Stream, connId: string, depth: number): TreeNode {
  return { id: `s:${connId}:${s.id}`, kind: "stream", label: s.title, sub: s.id.slice(0, 8), connId, streamId: s.id, depth };
}

/**
 * Stream children: one aggregation over the stream's traffic, normalized into endpoint
 * templates. Served from the cache when there is one, exactly as the IDE serves an
 * introspected schema; Refresh is what re-reads the source.
 */
async function streamChildren(node: TreeNode, conn: Connection, force: boolean): Promise<TreeNode[]> {
  const t = useApp.getState().settings.tree;
  const key = cache.cacheKey(conn.id);
  const streamId = node.streamId!;
  const cached = (await cache.load(key)).byStream[streamId];

  let rows = cached?.endpoints;
  if (force || !rows) {
    const g = clientFor(conn);
    const fields = await g.fields(streamId).catch(() => []);
    rows = await endpointsFromGraylog(g, streamId, fields, { lookbackHours: t.lookbackHours, limit: t.endpointLimit });
    await cache.putStream(key, streamId, { endpoints: rows, fields });
  }

  return sortEndpoints(rows, t.sortEndpointsBy)
    .slice(0, t.endpointLimit)
    .map((r) => ({
      id: `e:${conn.id}:${streamId}:${r.method}:${r.endpoint}`,
      kind: "endpoint" as const,
      label: r.endpoint,
      sub: r.method,
      connId: conn.id,
      streamId,
      endpoint: r,
      depth: node.depth + 1,
    }));
}

/** Flatten the tree into the rows the virtualizer draws. */
export function visibleRows(state: State): TreeNode[] {
  const out: TreeNode[] = [];
  const needle = state.filter.trim().toLowerCase();
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const n = state.nodes[id];
      if (!n) continue;
      const hit = !needle || n.label.toLowerCase().includes(needle) || (n.sub ?? "").toLowerCase().includes(needle);
      const open = state.expanded[id];
      if (hit) out.push(n);
      if (open && n.childrenIds) walk(n.childrenIds);
    }
  };
  walk(state.rootIds);
  return out;
}
