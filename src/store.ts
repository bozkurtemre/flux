import { create } from "zustand";
import { Graylog, absolute, setRequestTimeout, type FieldInfo, type MessagePage, type Stream } from "@/lib/graylog";
import { endpointsForStream, projectsFromMongo, type EndpointRow } from "@/lib/mongo";
import { loadProjectMapping } from "@/lib/watchdog-config";
import { applyAppearance, DEFAULTS, loadSettings, saveSettings, type Connection, type Settings } from "@/lib/settings";

export type NodeKind = "connection" | "project" | "stream" | "endpoint";

export interface TreeNode {
  id: string;
  kind: NodeKind;
  label: string;
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
  searchTab?: string;
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

  init: async () => {
    const settings = await loadSettings();
    applyAppearance(settings.appearance);
    setRequestTimeout(settings.advanced.requestTimeoutSeconds);
    set({ settings, ready: true });
    get().setSettings(settings);
  },

  setSettings: async (settings) => {
    await saveSettings(settings);
    applyAppearance(settings.appearance);
    setRequestTimeout(settings.advanced.requestTimeoutSeconds);
    const nodes: Record<string, TreeNode> = {};
    const rootIds: string[] = [];
    for (const c of settings.connections) {
      const id = `c:${c.id}`;
      nodes[id] = { id, kind: "connection", label: c.name || c.graylogUrl, sub: c.graylogUrl, connId: c.id, depth: 0 };
      rootIds.push(id);
    }
    set({ settings, nodes, rootIds });
  },

  setFilter: (filter) => set({ filter }),
  select: (selectedNode) => set({ selectedNode }),
  setShowSettings: (showSettings, settingsPage, settingsConnId) => set({ showSettings, settingsPage, settingsConnId }),
  setShowSearch: (showSearch, searchTab) => set({ showSearch, searchTab }),

  /**
   * Fill the node map for every connection, project and stream without expanding anything,
   * so Search Everywhere can match endpoints the tree has not shown yet.
   */
  indexAll: async () => {
    if (get().indexing) return;
    set({ indexing: true });
    try {
      for (const id of get().rootIds) {
        if (get().nodes[id]?.childrenIds === undefined) await loadChildren(id, set, get);
        for (const childId of get().nodes[id]?.childrenIds ?? []) {
          const child = get().nodes[childId];
          if (child?.kind === "project" && child.childrenIds === undefined) await loadChildren(childId, set, get);
        }
      }
      // streams can sit under a project or directly under a connection
      const streams = Object.values(get().nodes).filter((n) => n.kind === "stream" && n.childrenIds === undefined);
      await Promise.all(streams.map((n) => loadChildren(n.id, set, get)));
    } finally {
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
    if (open && node.childrenIds === undefined) await loadChildren(id, set, get);
  },

  refresh: async (id) => {
    const node = get().nodes[id];
    if (!node) return;
    set({ nodes: { ...get().nodes, [id]: { ...node, childrenIds: undefined, error: undefined } } });
    await loadChildren(id, set, get);
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
    void loadFields(tab.id, set, get);
    if (settings.editor.runOnOpen) void get().runQuery(tab.id);
  },

  closeTab: (id) => {
    const { tabs, activeTab } = get();
    const rest = tabs.filter((t) => t.id !== id);
    set({ tabs: rest, activeTab: activeTab === id ? rest[rest.length - 1]?.id : activeTab });
  },

  setActive: (activeTab) => set({ activeTab }),

  patchTab: (id, patch) => set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),

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
    }
  },
}));

/** Ask Graylog for the fields the tab's stream actually has, for the grid and autocomplete. */
async function loadFields(tabId: string, set: Setter, get: Getter) {
  const tab = get().tabs.find((t) => t.id === tabId);
  const conn = get().settings.connections.find((c) => c.id === tab?.connId);
  if (!tab || !conn || !tab.streamIds.length) return;
  try {
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

async function loadChildren(id: string, set: Setter, get: Getter) {
  const node = get().nodes[id];
  const conn = get().settings.connections.find((c) => c.id === node.connId);
  if (!node || !conn) return;
  set({ loading: { ...get().loading, [id]: true } });
  try {
    const made =
      node.kind === "connection"
        ? await connectionChildren(node, conn)
        : node.kind === "project"
          ? projectChildren(node, get)
          : await streamChildren(node, conn);
    const nodes = { ...get().nodes };
    for (const n of made) nodes[n.id] = { ...(nodes[n.id] ?? {}), ...n };
    nodes[id] = { ...nodes[id], childrenIds: made.map((n) => n.id), error: undefined };
    set({ nodes });
  } catch (e) {
    set({ nodes: { ...get().nodes, [id]: { ...node, childrenIds: [], error: (e as Error).message } } });
  } finally {
    set({ loading: { ...get().loading, [id]: false } });
  }
}

/** Connection children: projects when a mapping is available, otherwise the streams themselves. */
async function connectionChildren(node: TreeNode, conn: Connection): Promise<TreeNode[]> {
  const streams = await clientFor(conn).streams();
  const byId = new Map(streams.map((s) => [s.id, s]));
  const env = conn.env ?? conn.name;

  let mapping: { name: string; github?: string; streams: string[] }[] = [];
  if (conn.configPath) {
    mapping = await loadProjectMapping(conn.configPath, env).catch(() => []);
  }
  if (!mapping.length && conn.mongoUri) {
    mapping = (await projectsFromMongo(conn.mongoUri, env).catch(() => [])).map((p) => ({ name: p.project, streams: p.streams }));
  }

  const out: TreeNode[] = [];
  const claimed = new Set<string>();
  for (const p of mapping) {
    const owned = p.streams.filter((s) => byId.has(s));
    if (!owned.length) continue;
    owned.forEach((s) => claimed.add(s));
    const id = `p:${conn.id}:${p.name}`;
    out.push({
      id,
      kind: "project",
      label: p.name,
      sub: p.github,
      connId: conn.id,
      depth: 1,
      childrenIds: undefined,
      // stash for projectChildren
      endpoint: undefined,
      streamId: owned.join(","),
    });
  }
  const loose = streams.filter((s) => !claimed.has(s.id));
  for (const s of loose) out.push(streamNode(s, conn.id, mapping.length ? 1 : 1));
  void node;
  return out;
}

function projectChildren(node: TreeNode, get: Getter): TreeNode[] {
  const conn = get().settings.connections.find((c) => c.id === node.connId)!;
  const ids = (node.streamId ?? "").split(",").filter(Boolean);
  const known = get().nodes;
  return ids.map((sid) => {
    const existing = known[`s:${conn.id}:${sid}`];
    return existing
      ? { ...existing, depth: 2 }
      : { id: `s:${conn.id}:${sid}`, kind: "stream" as const, label: sid, connId: conn.id, streamId: sid, depth: 2 };
  });
}

function streamNode(s: Stream, connId: string, depth: number): TreeNode {
  return { id: `s:${connId}:${s.id}`, kind: "stream", label: s.title, sub: s.id.slice(0, 8), connId, streamId: s.id, depth };
}

/** Stream children: endpoints from the watchdog database, else from a Graylog aggregation. */
async function streamChildren(node: TreeNode, conn: Connection): Promise<TreeNode[]> {
  const env = conn.env ?? conn.name;
  const t = useApp.getState().settings.tree;
  const since = new Date(Date.now() - t.lookbackHours * 3600_000);
  let rows: EndpointRow[] = [];

  if (conn.mongoUri) {
    rows = await endpointsForStream(conn.mongoUri, env, node.streamId!, since).catch(() => []);
  }
  if (!rows.length) rows = await endpointsFromGraylog(conn, node.streamId!);

  rows = sortEndpoints(rows, t.sortEndpointsBy).slice(0, t.endpointLimit);

  return rows.map((r) => ({
    id: `e:${conn.id}:${node.streamId}:${r.method}:${r.endpoint}`,
    kind: "endpoint" as const,
    label: r.endpoint,
    sub: r.method,
    connId: conn.id,
    streamId: node.streamId,
    endpoint: r,
    depth: node.depth + 1,
  }));
}

function sortEndpoints(rows: EndpointRow[], by: "traffic" | "name" | "errors"): EndpointRow[] {
  const copy = [...rows];
  if (by === "name") return copy.sort((a, b) => a.endpoint.localeCompare(b.endpoint) || a.method.localeCompare(b.method));
  if (by === "errors") return copy.sort((a, b) => b.errorRatePct - a.errorRatePct || b.requests - a.requests);
  return copy.sort((a, b) => b.requests - a.requests);
}

/** Fallback when there is no watchdog database: group live logs by their route field. */
async function endpointsFromGraylog(conn: Connection, streamId: string): Promise<EndpointRow[]> {
  const g = clientFor(conn);
  const fields = await g.fields(streamId).catch(() => []);
  const routeField = ["route", "uri", "path", "request_path"].find((f) => fields.some((x) => x.name === f));
  if (!routeField) return [];
  const methodField = fields.some((f) => f.name === "method") ? "method" : undefined;
  const r = await g.aggregate({
    query: "*",
    streams: [streamId],
    timerange: { type: "relative", range: 86400 },
    groupBy: [{ field: routeField, limit: 500 }, ...(methodField ? [{ field: methodField, limit: 10 }] : [])],
    metrics: [{ function: "count" }],
  });
  return r.rows
    .map((row) => {
      const endpoint = String(row[0] ?? "");
      const method = methodField ? String(row[1] ?? "") : "";
      const requests = Number(row[row.length - 1]) || 0;
      return { endpoint, method: method === "(Empty Value)" ? "" : method, requests, errors: 0, errorRatePct: 0, p95Ms: null };
    })
    .filter((r) => r.endpoint && r.endpoint !== "(Empty Value)")
    .sort((a, b) => b.requests - a.requests);
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
