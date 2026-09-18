import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Graylog, absolute, bucketFor, setRequestTimeout, type Bucket, type FieldInfo, type MessagePage, type Stream } from "@/lib/graylog";
import { endpointsFromGraylog, sortEndpoints, type EndpointRow } from "@/lib/endpoints";
import * as cache from "@/lib/cache";
import { loadSession, saveSession, type SavedTab } from "@/lib/session";
import {
  chosenConnections,
  readWorkspaceFile,
  remember,
  writeWorkspaceFile,
  FORMAT as WORKSPACE_FORMAT,
  WORKSPACE_FILE,
  type Recent,
  type WorkspaceFile,
} from "@/lib/workspaces";
import { killTabCommand } from "@/lib/terminal";
import { errorText, failureReason, withNotice, type Notice, type NoticeKind, type Task } from "@/lib/progress";
import { fieldClause, parseQuery, withBetween, withClause, withGroupBy } from "@/lib/query";
import { loadQueries, nameFor, saveQueries, upsert, type SavedQuery } from "@/lib/queries";
import { offerable, type Manifest } from "@/lib/updates";
import { moveBefore } from "@/lib/reorder";
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

/** What one `| group by <field>` clause came back with. */
export interface GroupResult {
  field: string;
  rows: { value: string; count: number }[];
  /** A field Graylog cannot group by fails on its own, without taking the query with it. */
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
  /** The fields asked of Graylog. */
  columns: string[];
  /** The columns on screen, in order. Absent means the grid arranges what came back. */
  layout?: string[];
  /** The timeline over the results: counts per bucket for what this tab last asked. */
  histogram?: Bucket[];
  /** Newest messages are fetched and put on top while this is on. Off when a tab opens. */
  follow?: boolean;
  /** What the last tail brought in: the keys to tint, and a tick the grid can act on once. */
  tail?: { tick: number; keys: string[]; added: number };
  /** The saved query this console was opened from, if it was. */
  savedQueryId?: string;
  /** One table per `| group by` clause in the query, above the messages. */
  groups?: GroupResult[];
  /** How far into the result the page on screen starts. */
  offset?: number;
  /** Everything the query matches, not just the page on screen. */
  total?: number;
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
  /** The saved queries of the workspace that is open, newest first. */
  savedQueries: SavedQuery[];
  showQueries: boolean;
  /** The timeline folded away for now, as opposed to turned off in Settings. */
  timelineOpen: boolean;
  /** The tab whose query is being named, while the dialog is up. */
  namingQuery?: string;
  terminalSize: number;
  inspectorSize: number;
  projectFolders: Record<string, string>;
  /** Set once a tab has had to start without tmux, so quitting stops promising persistence. */
  tmuxMissing: boolean;
  tasks: Task[];
  notices: Notice[];
  /** The version waiting to be installed, once it has soaked. */
  update?: Manifest;
  showUpdateNotes: boolean;
  showAbout: boolean;
  /** The folder open as a workspace, if any. Its settings live in `.flux` inside it. */
  workspaceFolder?: string;
  recentWorkspaces: Recent[];
  /** Which connections the open workspace shows. Empty means all of them. */
  workspaceConnections: string[];
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
  refreshAll: () => Promise<void>;
  disconnectAll: () => void;
  reconnectAll: () => Promise<void>;
  openTab: (node: TreeNode) => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  moveTab: (id: string, onto: string) => void;
  patchTab: (id: string, patch: Partial<Tab>) => void;
  setColumns: (tabId: string, layout: string[]) => void;
  resetColumns: (tabId: string) => void;
  setPage: (tabId: string, offset: number) => void;
  setPageSize: (tabId: string, size: number) => void;
  runQuery: (id: string) => Promise<void>;
  setShowSettings: (v: boolean, page?: string, connId?: string) => void;
  setShowSearch: (v: boolean, tab?: string) => void;
  openTerminal: (projectId: string, title: string) => void;
  closeTerminal: (id: string) => void;
  killAllTerminals: () => Promise<void>;
  toggleTerminal: () => void;
  toggleQueries: () => void;
  toggleTimeline: () => void;
  /** ⌘S and the toolbar: an already-saved query is updated, a new one is named first. */
  saveActiveQuery: () => void;
  nameAndSaveQuery: (name: string) => void;
  /** The row menu: narrow to a field, exclude it, count by it, or look around a moment. */
  /** The toolbar toggle, and the tick that follows while it is on. */
  toggleFollow: (tabId: string) => void;
  tailTab: (tabId: string) => Promise<void>;
  filterByField: (tabId: string, field: string, value: unknown, negate?: boolean) => void;
  groupByField: (tabId: string, field: string) => void;
  openAround: (tabId: string, at: string, seconds: number) => void;
  openSavedQuery: (id: string) => void;
  renameSavedQuery: (id: string, name: string) => void;
  deleteSavedQuery: (id: string) => void;
  setTerminalSize: (size: number) => void;
  setInspectorSize: (size: number) => void;
  setActiveTerminal: (id: string) => void;
  setProjectFolder: (projectId: string, folder: string) => void;
  setProjectFolders: (folders: Record<string, string>) => void;
  setTmuxMissing: () => void;
  startTask: (title: string, cancel?: () => void) => string;
  setTaskProgress: (id: string, progress: number) => void;
  endTask: (id: string) => void;
  notify: (kind: NoticeKind, title: string, message: string, actions?: Notice["actions"]) => void;
  dismissNotice: (id: string) => void;
  checkForUpdates: (manual: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  setShowUpdateNotes: (v: boolean) => void;
  setShowAbout: (v: boolean) => void;
  openWorkspace: (folder: string) => Promise<void>;
  closeWorkspace: () => Promise<void>;
  setWorkspaceConnections: (ids: string[]) => Promise<void>;
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
  savedQueries: [],
  showQueries: false,
  timelineOpen: true,
  terminalSize: 32,
  inspectorSize: 30,
  projectFolders: {},
  tmuxMissing: false,
  tasks: [],
  notices: [],
  showUpdateNotes: false,
  showAbout: false,
  recentWorkspaces: [],
  workspaceConnections: [],

  init: async () => {
    let settings = DEFAULTS;
    let settingsError: string | undefined;
    try {
      settings = await loadSettings();
    } catch (e) {
      // a broken settings file must still leave a usable window
      settingsError = `Settings could not be read: ${errorText(e)}`;
    }
    const globals = await loadGlobals();
    set({ ready: true, settingsError, recentWorkspaces: globals.recents });
    await get().setSettings(settings);
    if (globals.current) {
      await get().openWorkspace(globals.current);
      return;
    }
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
    for (const c of chosenConnections(settings.connections, get().workspaceConnections)) {
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
      const folder = get().workspaceFolder;
      // the grouping belongs to the folder while one is open, and the global file is left
      // as whatever it was when no workspace was
      if (folder) {
        const file = (await readWorkspaceFile<WorkspaceFile>(folder, WORKSPACE_FILE)) ?? {
          format: WORKSPACE_FORMAT,
          connectionIds: [],
          projects: [],
        };
        await writeWorkspaceFile(folder, WORKSPACE_FILE, { ...file, projects: settings.projects });
      }
      set({ settingsError: undefined });
    } catch (e) {
      set({ settingsError: `Settings not saved: ${errorText(e)}` });
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

  toggleQueries: () => set({ showQueries: !get().showQueries }),
  toggleTimeline: () => set({ timelineOpen: !get().timelineOpen }),

  saveActiveQuery: () => {
    const tab = get().tabs.find((t) => t.id === get().activeTab);
    if (!tab) return;
    // one it already has a name for is saved where it stands; a new one is named first
    const saved = get().savedQueries.find((q) => q.id === tab.savedQueryId);
    if (!saved) return set({ namingQuery: tab.id });
    keepQuery(set, get, tab, { ...saved, query: tab.query, rangeSeconds: tab.rangeSeconds, savedAt: now() });
  },

  nameAndSaveQuery: (name) => {
    const tab = get().tabs.find((t) => t.id === get().namingQuery);
    set({ namingQuery: undefined });
    if (!tab) return;
    keepQuery(set, get, tab, {
      id: crypto.randomUUID(),
      name: name.trim() || nameFor(tab.query, tab.streamLabel),
      query: tab.query,
      connId: tab.connId,
      streamIds: tab.streamIds,
      streamLabel: tab.streamLabel,
      rangeSeconds: tab.rangeSeconds,
      savedAt: now(),
    });
  },

  openSavedQuery: (id) => {
    const query = get().savedQueries.find((q) => q.id === id);
    if (!query) return;
    const conn = get().settings.connections.find((c) => c.id === query.connId);
    if (!conn) {
      return get().notify("error", query.name, "The connection this query was saved against is no longer set up.");
    }
    // a saved query belongs to its own stream, so it opens the console for that stream
    // rather than landing in whichever one happens to be in front
    const tabId = query.streamIds[0] ? `s:${query.connId}:${query.streamIds[0]}` : `q:${query.id}`;
    if (!get().tabs.some((t) => t.id === tabId)) {
      const tab = blankTab(get().settings, conn, {
        id: tabId,
        title: query.streamLabel || query.name,
        connId: query.connId,
        streamIds: query.streamIds,
        streamLabel: query.streamLabel,
      });
      set({ tabs: [...get().tabs, tab], activeTab: tabId });
      void loadFields(tabId, set, get);
    } else {
      set({ activeTab: tabId });
    }
    get().patchTab(tabId, { query: query.query, rangeSeconds: query.rangeSeconds, savedQueryId: query.id, offset: 0 });
    void get().runQuery(tabId);
  },

  toggleFollow: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    get().patchTab(tabId, { follow: !tab.follow, tail: undefined });
  },

  /**
   * One tick of following: everything since the newest message on screen, put on top. It is a
   * second search rather than a re-run, so the page below it — and the place you had scrolled
   * to in it — stays where it was.
   */
  tailTab: async (tabId) => {
    const { tabs, settings } = get();
    const tab = tabs.find((t) => t.id === tabId);
    const conn = settings.connections.find((c) => c.id === tab?.connId);
    if (!tab || !conn || !tab.page || tab.running) return;
    const parsed = parseQuery(tab.query);
    // a window that does not move has nothing to follow, and neither has a page you have
    // turned away from the first one
    if (parsed.between || (tab.offset ?? 0) > 0) return;

    const newest = tab.page.rows[0]?.timestamp;
    const since = newest ? new Date(String(newest)) : null;
    if (!since || Number.isNaN(since.getTime())) return;
    const clauses = [parsed.search].filter(Boolean);
    if (tab.endpoint) clauses.push(endpointClause(tab.endpoint));
    const query = clauses.length ? clauses.map((c) => `(${c})`).join(" AND ") : "*";

    try {
      const page = await clientFor(conn).messages({
        query,
        streams: tab.streamIds,
        timerange: absolute(since, new Date()),
        fields: columnsForQuery(tab),
        size: settings.results.pageSize,
      });
      const current = get().tabs.find((t) => t.id === tabId);
      if (!current?.page || !current.follow) return;
      // the window is inclusive at both ends, so the message it started from comes back
      const known = new Set(current.page.rows.map(rowKey));
      const fresh = page.rows.filter((r) => !known.has(rowKey(r)));
      if (!fresh.length) return;
      get().patchTab(tabId, {
        page: { columns: current.page.columns, rows: [...fresh, ...current.page.rows].slice(0, settings.results.pageSize) },
        total: current.total != null ? current.total + fresh.length : undefined,
        // the selection is an index into those rows, and they all just moved down
        selectedRow: current.selectedRow == null ? undefined : current.selectedRow + fresh.length,
        tail: { tick: (current.tail?.tick ?? 0) + 1, keys: fresh.map(rowKey), added: fresh.length },
      });
    } catch {
      /* a tick that fails is a tick; the next one is two seconds away */
    }
  },

  filterByField: (tabId, field, value, negate) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    get().patchTab(tabId, { query: withClause(tab.query, fieldClause(field, value, negate)), offset: 0 });
    void get().runQuery(tabId);
  },

  groupByField: (tabId, field) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    get().patchTab(tabId, { query: withGroupBy(tab.query, field), offset: 0 });
    void get().runQuery(tabId);
  },

  /**
   * What was happening around one message: the same stream with nothing filtered out, over a
   * window that does not move. It is its own tab, because the search it came from is usually
   * still worth having.
   */
  openAround: (tabId, at, seconds) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    const conn = get().settings.connections.find((c) => c.id === tab?.connId);
    if (!tab || !conn) return;
    const centre = new Date(at);
    if (Number.isNaN(centre.getTime())) return;
    const from = new Date(centre.getTime() - seconds * 1000);
    const to = new Date(centre.getTime() + seconds * 1000);
    // the window is written into the query, where it can be read and edited like the rest of
    // what the console is asking
    const query = withBetween("", from, to);
    const id = `around:${tab.id}:${from.toISOString()}`;
    if (!get().tabs.some((t) => t.id === id)) {
      const next = blankTab(get().settings, conn, {
        id,
        title: `around ${centre.toLocaleTimeString()}`,
        connId: tab.connId,
        streamIds: tab.streamIds,
        streamLabel: tab.streamLabel,
      });
      set({ tabs: [...get().tabs, { ...next, query }], activeTab: id });
      void loadFields(id, set, get);
    } else {
      set({ activeTab: id });
      get().patchTab(id, { query });
    }
    void get().runQuery(id);
    persist(get);
  },

  renameSavedQuery: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({ savedQueries: get().savedQueries.map((q) => (q.id === id ? { ...q, name: trimmed } : q)) });
    void saveQueries(get().savedQueries, get().workspaceFolder);
  },

  deleteSavedQuery: (id) => {
    set({
      savedQueries: get().savedQueries.filter((q) => q.id !== id),
      // a tab that came from it is its own again, dot and all
      tabs: get().tabs.map((t) => (t.savedQueryId === id ? { ...t, savedQueryId: undefined } : t)),
    });
    void saveQueries(get().savedQueries, get().workspaceFolder);
    persist(get);
  },

  toggleTerminal: () => {
    set({ showTerminal: !get().showTerminal });
    persist(get);
  },

  setTerminalSize: (terminalSize) => {
    if (Math.abs(terminalSize - get().terminalSize) < 0.5) return;
    set({ terminalSize });
    persist(get);
  },

  setInspectorSize: (inspectorSize) => {
    if (Math.abs(inspectorSize - get().inspectorSize) < 0.5) return;
    set({ inspectorSize });
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

  notify: (kind, title, message, actions) => set({ notices: withNotice(get().notices, { id: crypto.randomUUID(), kind, title, message, actions }) }),
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
  /**
   * The plugin decides whether a version is newer; the manifest decides whether it may be
   * offered yet. A check nobody asked for stays quiet, whatever it finds.
   */
  checkForUpdates: async (manual) => {
    const task = manual ? get().startTask("Checking for updates") : undefined;
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const found = await check();
      const now = new Date();
      void get().setSettings({ ...get().settings, updates: { ...get().settings.updates, lastCheckedAt: now.toISOString() } });
      if (!found) {
        if (manual) get().notify("info", "Flux is up to date", "You are on the newest version.");
        return;
      }
      const manifest = await manifestFor(found.version, found.date, found.body);
      // still soaking: say what a check that found nothing says, rather than name a version
      // that cannot be installed yet and leave someone waiting on a clock
      if (!offerable(manifest, now)) {
        if (manual) get().notify("info", "Flux is up to date", "You are on the newest version.");
        return;
      }
      set({ update: manifest });
      if (get().settings.updates.dismissedVersion === manifest.version && !manual) return;
      get().notify("info", `Flux ${manifest.version} is available`, manifest.notes?.split("\n")[0] ?? "A new version is ready to install.", [
        { label: "Update and Restart", run: () => void get().installUpdate() },
        { label: "Release notes", run: () => set({ showUpdateNotes: true }) },
        { label: "Later", run: () => get().dismissUpdate() },
      ]);
    } catch (e) {
      if (manual) get().notify("error", "Could not check for updates", failureReason(e));
    } finally {
      if (task) get().endTask(task);
    }
  },

  installUpdate: async () => {
    const version = get().update?.version ?? "";
    const task = get().startTask(`Downloading Flux ${version}`);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const found = await check();
      if (!found) throw new Error("the update is no longer being offered");
      let taken = 0;
      let total = 0;
      await found.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          taken += event.data.chunkLength;
          if (total) get().setTaskProgress(task, taken / total);
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      get().notify("error", `Could not install Flux ${version}`, failureReason(e));
    } finally {
      get().endTask(task);
    }
  },

  setShowUpdateNotes: (showUpdateNotes) => set({ showUpdateNotes }),
  setShowAbout: (showAbout) => set({ showAbout }),

  /**
   * Later means later, not never: the balloon goes, the version stays known, and the status
   * bar carries it until it is installed.
   */
  dismissUpdate: () => {
    const version = get().update?.version;
    if (version) void get().setSettings({ ...get().settings, updates: { ...get().settings.updates, dismissedVersion: version } });
  },

  /**
   * Opening a folder swaps what is on screen for what that folder remembers: its stream
   * grouping, its tabs, its tree. Connections are not swapped — they carry tokens and stay
   * in the config directory (docs/adr/0006); a workspace only says which of them it uses.
   */
  openWorkspace: async (folder) => {
    const file = (await readWorkspaceFile<WorkspaceFile>(folder, WORKSPACE_FILE)) ?? {
      format: WORKSPACE_FORMAT,
      connectionIds: [],
      projects: [],
    };
    const recentWorkspaces = remember(get().recentWorkspaces, folder, Math.floor(Date.now() / 1000));
    set({
      workspaceFolder: folder,
      workspaceConnections: file.connectionIds,
      recentWorkspaces,
      tabs: [],
      activeTab: undefined,
      expanded: {},
      terminals: [],
    });
    await writeWorkspaceFile(folder, WORKSPACE_FILE, { ...file, format: WORKSPACE_FORMAT });
    await get().setSettings({ ...get().settings, projects: file.projects });
    await restoreWorkspace(set, get);
    await saveGlobals(get);
  },

  closeWorkspace: async () => {
    set({ workspaceFolder: undefined, workspaceConnections: [], tabs: [], activeTab: undefined, expanded: {}, terminals: [] });
    const settings = await loadSettings().catch(() => get().settings);
    await get().setSettings(settings);
    await restoreWorkspace(set, get);
    await saveGlobals(get);
  },

  setWorkspaceConnections: async (ids) => {
    const folder = get().workspaceFolder;
    if (!folder) return;
    set({ workspaceConnections: ids });
    const file = (await readWorkspaceFile<WorkspaceFile>(folder, WORKSPACE_FILE)) ?? {
      format: WORKSPACE_FORMAT,
      connectionIds: [],
      projects: [],
    };
    await writeWorkspaceFile(folder, WORKSPACE_FILE, { ...file, connectionIds: ids });
    // rebuilding the roots is what puts a connection into the tree or takes it out
    await get().setSettings(get().settings);
  },

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

  /**
   * Flux holds no connection open: every action is its own request, so these three are about
   * what the window knows rather than about a socket. Refresh re-reads from Graylog what is
   * on screen; Disconnect forgets it, clients included, leaving the tree as cold as a fresh
   * launch; Reconnect is the two in order.
   */
  refreshAll: async () => {
    await Promise.all(get().rootIds.map((id) => get().refresh(id)));
  },

  disconnectAll: () => {
    clients.clear();
    const nodes = Object.fromEntries(Object.entries(get().nodes).map(([id, n]) => [id, { ...n, childrenIds: undefined, error: undefined }]));
    set({ nodes, expanded: {}, loading: {} });
    persist(get);
  },

  reconnectAll: async () => {
    get().disconnectAll();
    await Promise.all(get().rootIds.map((id) => get().refresh(id)));
  },

  openTab: (node) => {
    const { tabs, settings } = get();
    const existing = tabs.find((t) => t.id === node.id);
    if (existing) return set({ activeTab: existing.id });
    const conn = settings.connections.find((c) => c.id === node.connId);
    if (!conn) return;

    const streamIds = node.kind === "endpoint" || node.kind === "stream" ? [node.streamId!] : [];
    const parentLabel = node.kind === "endpoint" ? (get().nodes[`s:${node.connId}:${node.streamId}`]?.label ?? "") : node.label;
    const tab = blankTab(settings, conn, {
      id: node.id,
      title: node.kind === "endpoint" ? `${node.endpoint?.method ?? ""} ${node.label}`.trim() : node.label,
      connId: node.connId,
      streamIds,
      streamLabel: parentLabel,
      endpoint: node.endpoint,
    });
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

  /** Drag a tab in front of another. The order is part of what the workspace restores. */
  moveTab: (id, onto) => {
    const order = moveBefore(
      get().tabs.map((t) => t.id),
      id,
      onto,
    );
    set({ tabs: order.map((tabId) => get().tabs.find((t) => t.id === tabId)!) });
    persist(get);
  },

  patchTab: (id, patch) => {
    // a different question is asked from the first page, not from wherever you had scrolled to
    if (("query" in patch || "rangeSeconds" in patch) && !("offset" in patch)) patch = { ...patch, offset: 0 };
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    // only the parts worth reopening with
    if ("query" in patch || "rangeSeconds" in patch || "columns" in patch || "layout" in patch) persist(get);
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

  /**
   * A column layout is a property of the connection, not of the tab you happened to set it
   * up in: every tab opened on that connection from now on starts arranged this way.
   */
  setColumns: (tabId, layout) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    get().patchTab(tabId, { layout, columns: layout });
    const connections = get().settings.connections.map((c) => (c.id === tab.connId ? { ...c, columns: layout } : c));
    void get().setSettings({ ...get().settings, connections });
    // a column nobody asked Graylog for has nothing in it until the query runs again
    if (layout.some((c) => !(tab.page?.columns ?? []).includes(c))) void get().runQuery(tabId);
  },

  resetColumns: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    get().patchTab(tabId, { layout: undefined, columns: DEFAULT_COLUMNS });
    const connections = get().settings.connections.map((c) => (c.id === tab.connId ? { ...c, columns: undefined } : c));
    void get().setSettings({ ...get().settings, connections });
  },

  /** Paging is a fresh search from a different offset: Graylog holds no cursor for us. */
  setPage: (tabId, offset) => {
    get().patchTab(tabId, { offset: Math.max(0, offset) });
    void get().runQuery(tabId);
  },

  setPageSize: (tabId, pageSize) => {
    const { settings } = get();
    void get().setSettings({ ...settings, results: { ...settings.results, pageSize } });
    get().patchTab(tabId, { offset: 0 });
    void get().runQuery(tabId);
  },

  runQuery: async (id) => {
    const { tabs, settings, patchTab } = get();
    const tab = tabs.find((t) => t.id === id);
    const conn = settings.connections.find((c) => c.id === tab?.connId);
    if (!tab || !conn) return;
    patchTab(id, { running: true, error: undefined });
    const stop = new AbortController();
    const task = get().startTask(`Running the query on ${tab.streamLabel}`, () => stop.abort());
    const started = performance.now();
    try {
      const parsed = parseQuery(tab.query);
      const clauses = [parsed.search].filter(Boolean);
      if (tab.endpoint) clauses.push(endpointClause(tab.endpoint));
      const to = new Date();
      const query = clauses.length ? clauses.map((c) => `(${c})`).join(" AND ") : "*";
      // a line that names a window searches it; everything else searches the last minutes
      const timerange = parsed.between
        ? absolute(new Date(parsed.between.from), new Date(parsed.between.to))
        : absolute(new Date(to.getTime() - tab.rangeSeconds * 1000), to);
      const client = clientFor(conn);
      // Each clause is its own aggregation: one row per value of the field with how many
      // messages carried it. They run beside the messages rather than instead of them, so
      // the grid below keeps showing what matched.
      const grouped = parsed.groupBy.map(async (field): Promise<GroupResult> => {
        try {
          const r = await client.aggregate({
            query,
            streams: tab.streamIds,
            timerange,
            groupBy: [{ field, limit: settings.results.pageSize }],
            metrics: [{ function: "count" }],
            signal: stop.signal,
          });
          return { field, rows: r.rows.map((row) => ({ value: String(row[0] ?? ""), count: Number(row[row.length - 1]) || 0 })) };
        } catch (e) {
          if (stop.signal.aborted) throw e;
          return { field, rows: [], error: failureReason(e) };
        }
      });

      // the timeline is two round trips of its own, so it is asked for only when it is on
      // screen, and never blocks the rows
      const timeline = settings.results.timeline
        ? client
            .histogram({
              query,
              streams: tab.streamIds,
              timerange,
              interval: bucketFor(
                parsed.between
                  ? Math.max(1, (new Date(parsed.between.to).getTime() - new Date(parsed.between.from).getTime()) / 1000)
                  : tab.rangeSeconds,
              ),
              signal: stop.signal,
            })
            .catch(() => [])
        : Promise.resolve([]);

      // the total rides alongside rather than after: it is a second search, and waiting for
      // it would put its time on every page turn
      const [page, total, groups, histogram] = await Promise.all([
        client.messages({
          query,
          streams: tab.streamIds,
          timerange,
          fields: columnsForQuery(tab),
          size: settings.results.pageSize,
          from: tab.offset ?? 0,
          signal: stop.signal,
        }),
        client.count({ query, streams: tab.streamIds, timerange, signal: stop.signal }),
        Promise.all(grouped),
        timeline,
      ]);
      patchTab(id, {
        page,
        histogram: histogram.length ? histogram : undefined,
        tail: undefined,
        groups: groups.length ? groups : undefined,
        total: total || undefined, // a count that failed comes back as zero, and zero rows say so themselves
        took: Math.round(performance.now() - started),
        running: false,
        selectedRow: undefined,
      });
    } catch (e) {
      if (stop.signal.aborted) patchTab(id, { running: false });
      else {
        patchTab(id, { error: errorText(e), running: false, page: undefined, groups: undefined, histogram: undefined });
        get().notify("error", conn.name || conn.graylogUrl, `Query failed: ${failureReason(e)}`);
      }
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

const now = () => Math.floor(Date.now() / 1000);

/** What makes a message that one: its id when Graylog gave one, its content when it did not. */
const rowKey = (row: Record<string, unknown>) => String(row.gl2_message_id ?? `${String(row.timestamp)}|${String(row.message)}`);

/** A console with nothing in it yet: what a tree node and a saved query both start from. */
function blankTab(
  settings: Settings,
  conn: Connection,
  o: { id: string; title: string; connId: string; streamIds: string[]; streamLabel: string; endpoint?: EndpointRow },
): Tab {
  return {
    ...o,
    query: "",
    rangeSeconds: settings.results.defaultRangeSeconds,
    running: false,
    fields: [],
    columns: conn.columns?.length ? conn.columns : DEFAULT_COLUMNS,
    layout: conn.columns?.length ? conn.columns : undefined,
  };
}

/** Keep an entry, point the tab at it, and show the panel it landed in. */
function keepQuery(set: Setter, get: Getter, tab: Tab, entry: SavedQuery): void {
  set({ savedQueries: upsert(get().savedQueries, entry), showQueries: true });
  get().patchTab(tab.id, { savedQueryId: entry.id });
  void saveQueries(get().savedQueries, get().workspaceFolder);
}

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
  layout: t.layout,
  savedQueryId: t.savedQueryId,
});

/**
 * The updater plugin reports the version, the date and the notes; the soak is ours and lives
 * in the same file, so the file is read once more for it. A manifest that cannot be read
 * falls back to what the plugin said, which the soak's own default then covers.
 */
async function manifestFor(version: string, date: string | undefined, notes: string | undefined): Promise<Manifest> {
  try {
    const { fetch: httpFetch } = await import("@tauri-apps/plugin-http");
    const res = await httpFetch("https://updates.emreb.dev/updates/latest.json", { headers: { "Cache-Control": "no-cache" } });
    const json = (await res.json()) as Manifest;
    if (json.version === version) return json;
  } catch {
    /* the plugin already told us enough to offer it */
  }
  return { version, pub_date: date, notes };
}

/** Which folder was open and which were open before it: the app's own memory, not a workspace's. */
async function saveGlobals(get: Getter) {
  const { load } = await import("@tauri-apps/plugin-store");
  const store = await load("workspaces.json", { autoSave: false });
  await store.set("workspaces", { current: get().workspaceFolder, recents: get().recentWorkspaces });
  await store.save();
}

export async function loadGlobals(): Promise<{ current?: string; recents: Recent[] }> {
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    const store = await load("workspaces.json", { autoSave: false });
    return (await store.get<{ current?: string; recents: Recent[] }>("workspaces")) ?? { recents: [] };
  } catch {
    return { recents: [] };
  }
}

function persist(get: Getter) {
  const { expanded, selectedNode, tabs, activeTab, terminals, activeTerminal, showTerminal, terminalSize, inspectorSize, projectFolders } = get();
  saveSession(
    {
      expanded,
      selectedNode,
      tabs: tabs.map(savedShape),
      activeTab,
      terminals,
      activeTerminal,
      showTerminal,
      terminalSize,
      inspectorSize,
      projectFolders,
    },
    get().workspaceFolder,
  );
}

/**
 * Reopen what was open. Tabs come back with their query and range but no results, so the
 * active one re-runs and the rest wait until they are looked at, as the IDE does.
 */
async function restoreWorkspace(set: Setter, get: Getter) {
  const w = await loadSession(get().workspaceFolder);
  // the saved queries belong to the same folder, and are read before anything below can
  // return early
  set({ savedQueries: await loadQueries(get().workspaceFolder) });
  // terminals come back before the early return below: a window with only a terminal open
  // is a perfectly ordinary way to have left the app
  const projects = new Set(get().settings.projects.map((p) => p.id));
  const terminals = w.terminals.filter((t) => projects.has(t.projectId));
  set({
    projectFolders: w.projectFolders,
    terminals,
    activeTerminal: terminals.some((t) => t.id === w.activeTerminal) ? w.activeTerminal : terminals[0]?.id,
    showTerminal: !!w.showTerminal && terminals.length > 0,
    terminalSize: w.terminalSize ?? 32,
    inspectorSize: w.inspectorSize ?? 30,
  });

  const live = new Set(chosenConnections(get().settings.connections, get().workspaceConnections).map((c) => c.id));
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
  const stop = new AbortController();
  const task = get().startTask(node.kind === "connection" ? `Connecting to ${conn.name || conn.graylogUrl}` : `Loading ${node.label}`, () =>
    stop.abort(),
  );
  try {
    const made =
      node.kind === "connection"
        ? await connectionChildren(node, conn, force, stop.signal)
        : node.kind === "project"
          ? await projectChildren(node, get)
          : await streamChildren(node, conn, force, stop.signal);
    const nodes = { ...get().nodes };
    for (const n of made) nodes[n.id] = { ...(nodes[n.id] ?? {}), ...n };
    nodes[id] = { ...nodes[id], childrenIds: made.map((n) => n.id), error: undefined };
    set({ nodes });
  } catch (e) {
    // stopping on purpose is not news: leave the node as it was and say nothing
    if (stop.signal.aborted) {
      set({ nodes: { ...get().nodes, [id]: { ...node, childrenIds: undefined } } });
    } else {
      set({ nodes: { ...get().nodes, [id]: { ...node, childrenIds: [], error: errorText(e) } } });
      const what = node.kind === "connection" ? "Connection failed" : `Could not load ${node.label}`;
      get().notify("error", conn.name || conn.graylogUrl, `${what}: ${failureReason(e)}`);
    }
  } finally {
    get().endTask(task);
    set({ loading: { ...get().loading, [id]: false } });
  }
}

/**
 * Connection children: the projects the user defined, then any stream no project claims.
 * Streams come from the cache first so the tree opens instantly, and refresh behind it.
 */
async function connectionChildren(node: TreeNode, conn: Connection, force: boolean, signal?: AbortSignal): Promise<TreeNode[]> {
  const cached = await cache.load(cache.cacheKey(conn.id));
  let streams = cached.streams;
  if (force || !streams.length) {
    streams = await clientFor(conn).streams(signal);
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
async function streamChildren(node: TreeNode, conn: Connection, force: boolean, signal?: AbortSignal): Promise<TreeNode[]> {
  const t = useApp.getState().settings.tree;
  const key = cache.cacheKey(conn.id);
  const streamId = node.streamId!;
  const cached = (await cache.load(key)).byStream[streamId];

  let rows = cached?.endpoints;
  if (force || !rows) {
    const g = clientFor(conn);
    const fields = await g.fields(streamId, undefined, signal).catch(() => []);
    rows = await endpointsFromGraylog(g, streamId, fields, { lookbackHours: t.lookbackHours, limit: t.endpointLimit, signal });
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
