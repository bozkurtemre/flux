import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  SOURCE_KINDS,
  absolute,
  bucketFor,
  bucketed,
  rowKey,
  setRequestTimeout,
  type Bucket,
  type DataSource,
  type FieldInfo,
  type MessagePage,
  type Stream,
  type TimeRange,
} from "@/lib/datasource";
import { schedulePush } from "@/lib/cloud";
import { Graylog } from "@/lib/graylog";
import { baselineOf, candidateFields, explain, type Counted, type Explanation } from "@/lib/explain";
import { andTerms, checkField, fieldOf, TERMS, without } from "@/lib/zero";
import { blameCommand, grepCommand, literalsOf, prCommand, rank, readBlame, readGrep, readPr, type Blame, type Hit } from "@/lib/located";
import { Kibana } from "@/lib/kibana";
import { Local } from "@/lib/local";
import { endpointsFrom, inferMapping, sortEndpoints, type EndpointRow } from "@/lib/endpoints";
import * as cache from "@/lib/cache";
import { loadSession, saveSession, type RanQuery, type SavedTab } from "@/lib/session";
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
import { announce } from "@/lib/notify";
import { errorText, failureReason, withNotice, type Notice, type NoticeKind, type Task } from "@/lib/progress";
import { correlationOf, customFields, identifying, leaf, NAME_LABELS, NAMES, setCorrelationFields } from "@/lib/correlation";
import { journeyOf } from "@/lib/journey";
import { messageField, templateOf } from "@/lib/patterns";
import type { Evidence } from "@/lib/investigate";
import { mergesCommand, readMerges, type Marker } from "@/lib/deploys";
import { connectionFor, linkFor, readLink } from "@/lib/link";
import { draftForPattern, draftForRow, issueUrl, type Draft } from "@/lib/jira";
import { ideName, ideUrl, localPath, sourceRefs, type SourceRef } from "@/lib/source";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fieldClause, parseQuery, withBetween, withClause, withGroupBy, withPatterns, withSearch } from "@/lib/query";
import {
  alarm,
  due,
  loadQueries,
  nameFor,
  remember as rememberQuery,
  saveQueries,
  upsert,
  watchEvery,
  quietVerdict,
  type SavedQuery,
} from "@/lib/queries";
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
  /** `sample` is a real line behind a pattern, which a template on its own is not. */
  rows: { value: string; count: number; sample?: string }[];
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
  /** When the query now running was started, for the island to count up from. */
  startedAt?: number;
  /** Oldest first, for a tab that is telling a story rather than showing the latest. */
  sortOrder?: "asc" | "desc";
  /** The timeline over the results: counts per bucket for what this tab last asked. */
  histogram?: Bucket[];
  /** The pull requests merged across the timeline, drawn on it. */
  markers?: Marker[];
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
  /** The id this tab traces across every stream, when it was opened to tell one id's story. */
  trace?: string;
  /** Why the search found nothing: the window counted whole, and with each term left out. */
  zero?: Zero;
  /** Why a stretch of the timeline differs from what came before it, while it is asked. */
  explain?: { from: string; to: string; running?: boolean; rows: Explanation[]; asked: string[]; error?: string };
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
  /** Endpoints shares the terminal's place at the bottom; one of the two is shown at a time. */
  showEndpoints: boolean;
  /** The main area: the explorer and its consoles, or the Monitor dashboard in their place. */
  view: "explorer" | "monitor";
  /** The tour, played again over the IDE from Help or Find Action. */
  showTour: boolean;
  setShowTour: (show: boolean) => void;
  /** How many times the explorer has come back from the Monitor: each one plays its shimmer once. */
  returns: number;
  /** What the Monitor watches, kept while it is closed: a connection, and one stream or all of them. */
  monitorScope: { connId?: string; streamId?: string };
  /** The saved queries of the workspace that is open, newest first. */
  savedQueries: SavedQuery[];
  /** Every query that was run, newest first, whether it was worth saving or not. */
  history: RanQuery[];
  /** Whether each connection answered when it was last asked, by connection id. */
  health: Record<string, { up: boolean; at: number; error?: string }>;
  /** Which tool window the right dock is showing, if any. */
  rightTool: "queries" | "notifications" | null;
  /** Width of the saved queries panel, kept across openings. */
  queriesSize: number;
  /** The timeline folded away for now, as opposed to turned off in Settings. */
  timelineOpen: boolean;
  /** Whether a traced id's lanes are drawn or folded to their heading, for every tab. */
  journeyOpen: boolean;
  /** The fields of the results, under the tree. */
  showFields: boolean;
  fieldsSize: number;
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
  /** The MCP tool call just answered, for the island to show for a moment. */
  mcpCall?: { tool: string; detail: string; failed: boolean; at: number };
  noteMcpCall: (tool: string, detail: string, failed: boolean) => void;
  /** Until when the island stays off the screen, asked for from the island itself. */
  islandMutedUntil?: number;
  /** The last long command a terminal finished, for the island to say for a while. */
  commandDone?: { terminal: string; command: string; code: number; ms: number; at: number };
  noteCommand: (terminal: string, command: string, code: number, ms: number) => void;
  muteIsland: (minutes: number | null) => void;
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
  toggleEndpoints: () => void;
  setView: (view: "explorer" | "monitor") => void;
  setMonitorScope: (scope: { connId?: string; streamId?: string }) => void;
  /** Ask every connection whether it is there. Quiet: nothing is notified, the tree shows it. */
  checkConnections: () => Promise<void>;
  toggleRightTool: (tool: "queries" | "notifications") => void;
  setQueriesSize: (n: number) => void;
  toggleTimeline: () => void;
  toggleJourney: () => void;
  toggleFields: () => void;
  setFieldsSize: (n: number) => void;
  /** ⌘S and the toolbar: an already-saved query is updated, a new one is named first. */
  saveActiveQuery: () => void;
  nameAndSaveQuery: (name: string) => void;
  /** The row menu: narrow to a field, exclude it, count by it, or look around a moment. */
  /** The toolbar toggle, and the tick that follows while it is on. */
  toggleFollow: (tabId: string) => void;
  tailTab: (tabId: string) => Promise<void>;
  filterByField: (tabId: string, field: string, value: unknown, negate?: boolean) => void;
  groupByField: (tabId: string, field: string) => void;
  showPatterns: (tabId: string, field: string) => void;
  /** Everything a request touched, across every stream of its connection. */
  followRequest: (tabId: string, row: Record<string, unknown>, field?: string) => Promise<void>;
  /** Where a message is written in the code: the lines that hold it, and who last changed one. */
  located: Located | null;
  whereLogged: (tabId: string, template: string) => Promise<void>;
  /** Blame one of the lines found, and find the pull request it came in with. */
  blameHit: (index: number) => Promise<void>;
  /** The row whose request is being sent again, and the connection it was logged on. */
  replay: { connId: string; row: Record<string, unknown> } | null;
  /** The case being made about one error: the evidence as it arrives, and what is still coming. */
  investigation: Investigation | null;
  investigate: (tabId: string, row: Record<string, unknown>) => Promise<void>;
  /** The service map of a connection: a sample of its lines that carry an id, and its streams' names. */
  serviceMap: MapSample | null;
  openServiceMap: (connId: string, seconds?: number) => Promise<void>;
  /** The Trace an ID dialog, with what to start it with when it is open. */
  traceDraft: string | null;
  setTraceDraft: (draft: string | null) => void;
  /** One id's story across every stream of a connection, over the last `seconds`. */
  traceId: (connId: string, value: string, seconds: number) => Promise<void>;
  /** Which values set a stretch of the timeline apart from the time just before it. */
  explainRange: (tabId: string, from: Date, to: Date) => Promise<void>;
  followValue: (tabId: string, value: string, field?: string) => Promise<void>;
  /** A file and line a log named, opened in the IDE, in the checkout of the tab's project. */
  openSource: (tabId: string, ref: SourceRef) => void;
  openAround: (tabId: string, at: string, seconds: number) => void;
  openSavedQuery: (id: string) => void;
  /** Run something out of the history again, in the console it belongs to. */
  openHistory: (id: string) => void;
  /** A Jira issue started from a row or a pattern, in the browser that is signed in to Jira. */
  issueFromRow: (tabId: string, row: Record<string, unknown>) => void;
  issueFromPattern: (tabId: string, pattern: { template: string; count: number; sample: string }) => void;
  /** A `flux://open?…` link, opened on whichever connection here answers for its Graylog. */
  openLink: (link: string) => void;
  /** A console for a stream, opened and run: what an agent asks for with open_query. */
  openQuery: (o: { connId: string; streamId: string; query: string; minutes?: number }) => void;
  clearHistory: () => void;
  renameSavedQuery: (id: string, name: string) => void;
  /** Queries arriving from a set-up file, kept with this workspace like any other. */
  addSavedQueries: (queries: SavedQuery[]) => void;
  /** Watch a saved query: new matches are reported while the window is open. */
  toggleWatch: (id: string) => void;
  /** How often this one looks, in seconds; undefined hands it back to the setting. */
  /** Keep a saved query whole, new or replacing the one with its id: what an agent's save_query lands in. */
  keepSavedQuery: (entry: SavedQuery) => void;
  setWatchInterval: (id: string, seconds?: number) => void;
  /** How loudly a watched query reports: info, warning or error. */
  setWatchLevel: (id: string, level: NoticeKind) => void;
  /** Watch for fewer than `below` in a round instead of for new matches; undefined goes back. */
  setWatchQuiet: (id: string, below: number | undefined) => void;
  /** One round of watching, run on a timer by the window. */
  checkWatches: () => Promise<void>;
  deleteSavedQuery: (id: string) => void;
  setTerminalSize: (size: number) => void;
  setInspectorSize: (size: number) => void;
  setActiveTerminal: (id: string) => void;
  setProjectFolder: (projectId: string, folder: string) => void;
  setProjectFolders: (folders: Record<string, string>) => void;
  setTmuxMissing: () => void;
  /** Stops the query running in a tab, as the task's own cancel would. */
  cancelQuery: (tabId: string) => void;
  startTask: (title: string, cancel?: () => void) => string;
  setTaskProgress: (id: string, progress: number) => void;
  endTask: (id: string) => void;
  notify: (kind: NoticeKind, title: string, message: string, actions?: Notice["actions"]) => void;
  /** Each watched query's last round: when it looked, and what it found. */
  /** What each watched query's last round found, and, for a silence watch, whether it is quiet. */
  watchLog: Record<string, { at: number; found: number; quiet?: boolean }>;
  /** Up to two rows picked for comparing, from whichever tabs they were in. */
  picks: Pick[];
  showCompare: boolean;
  /** Pick the row the inspector is showing, or put it back; the second pick opens the window. */
  togglePick: (tabId: string) => void;
  clearPicks: () => void;
  /** Everything notified this session, newest first, balloons included once they are gone. */
  noticeLog: Notice[];
  clearNotices: () => void;
  dropNotice: (id: string) => void;
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

/** The columns a console starts with, in the field names its kind of source uses. */
export function defaultColumns(conn: Connection | undefined): string[] {
  return SOURCE_KINDS[conn?.kind ?? "graylog"].columns;
}

const clients = new Map<string, DataSource>();
/** The query running in each tab, so that it can be stopped from outside the tab: the island. */
const running = new Map<string, AbortController>();
/** The adapter for a connection's kind of source. Everything that asks a source goes through here. */
export function clientFor(conn: Connection): DataSource {
  const key = `${conn.id}:${conn.kind}:${conn.url}:${conn.token}`;
  let c = clients.get(key);
  if (!c) {
    c = conn.kind === "kibana" ? new Kibana(conn.url, conn.token) : conn.kind === "local" ? new Local(conn.url) : new Graylog(conn.url, conn.token);
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
  traceDraft: null,
  investigation: null,
  serviceMap: null,
  replay: null,
  located: null,
  indexing: false,
  terminals: [],
  showTerminal: false,
  showEndpoints: false,
  view: "explorer",
  returns: 0,
  showTour: false,
  setShowTour: (showTour) => set({ showTour }),
  monitorScope: {},
  savedQueries: [],
  history: [],
  health: {},
  rightTool: null,
  timelineOpen: true,
  journeyOpen: true,
  showFields: true,
  fieldsSize: 34,
  terminalSize: 32,
  inspectorSize: 30,
  queriesSize: 18,
  projectFolders: {},
  tmuxMissing: false,
  tasks: [],
  notices: [],
  noticeLog: [],
  picks: [],
  showCompare: false,
  watchLog: {},

  togglePick: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    const row = tab?.selectedRow != null ? tab.page?.rows[tab.selectedRow] : undefined;
    if (!tab || !row) return;
    const key = pickKey(tab, row);
    const picks = get().picks;
    if (picks.some((p) => p.key === key)) return set({ picks: picks.filter((p) => p.key !== key) });
    // a third pick replaces the older of the two: the newest pair is the one being asked about
    const next = [...picks, { key, row, title: tab.title, at: String(row.timestamp ?? "") }].slice(-2);
    set({ picks: next, showCompare: next.length === 2 });
  },
  clearPicks: () => set({ picks: [], showCompare: false }),
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
    setCorrelationFields(settings.advanced.correlationFields ?? "");
    const nodes: Record<string, TreeNode> = {};
    const rootIds: string[] = [];
    for (const c of chosenConnections(settings.connections, get().workspaceConnections)) {
      const id = `c:${c.id}`;
      nodes[id] = { id, kind: "connection", label: c.name || c.url, sub: c.url, connId: c.id, depth: 0 };
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
      // the account's copy of the preferences follows, a few seconds after the last change
      schedulePush(settings);
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
    set({ terminals: [...get().terminals, tab], activeTerminal: tab.id, showTerminal: true, showEndpoints: false });
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

  checkConnections: async () => {
    const connections = chosenConnections(get().settings.connections, get().workspaceConnections);
    const answers = await Promise.all(
      connections.map(async (c) => {
        // the version endpoint is the cheapest thing Graylog answers, and its own timeout
        // keeps a hung connection from holding the next check up
        const up = await clientFor(c)
          .version(AbortSignal.timeout(8000))
          .then(() => true)
          .catch(() => false);
        return [c.id, { up, at: Date.now() }] as const;
      }),
    );
    set({ health: Object.fromEntries(answers) });
  },

  toggleRightTool: (tool) => {
    set({ rightTool: get().rightTool === tool ? null : tool });
    persist(get);
  },

  setQueriesSize: (queriesSize) => {
    set({ queriesSize });
    persist(get);
  },
  toggleTimeline: () => set({ timelineOpen: !get().timelineOpen }),
  toggleJourney: () => set({ journeyOpen: !get().journeyOpen }),

  toggleFields: () => {
    set({ showFields: !get().showFields });
    persist(get);
  },

  setFieldsSize: (fieldsSize) => {
    set({ fieldsSize });
    persist(get);
  },

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
    if (query) runSomewhere(set, get, query, query.id);
  },

  openHistory: (id) => {
    const ran = get().history.find((h) => h.id === id);
    if (ran) runSomewhere(set, get, { ...ran, name: ran.query || "*" });
  },

  issueFromRow: (tabId, row) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const frames = sourceRefs(JSON.stringify(row)).filter((r) => !r.path.includes("vendor/"));
    openIssue(get, draftForRow({ row, stream: tab.streamLabel, frames, link: viewLink(get, tab), count: tab.total }));
  },

  issueFromPattern: (tabId, pattern) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    openIssue(get, draftForPattern({ ...pattern, stream: tab.streamLabel, link: viewLink(get, tab) }));
  },

  openLink: (link) => {
    const shared = readLink(link);
    if (!shared) return get().notify("warning", "Not a Flux link", link.slice(0, 120));
    const conn = connectionFor(get().settings.connections, shared.graylog);
    if (!conn) {
      return get().notify(
        "info",
        "A link to another connection",
        `${shared.graylog} is not set up here. Add it as a connection and open the link again.`,
        [{ label: "Open Settings", run: () => get().setShowSettings(true, "connections") }],
      );
    }
    runSomewhere(set, get, {
      name: shared.query || "*",
      query: shared.query,
      connId: conn.id,
      streamIds: [shared.stream],
      streamLabel: get().nodes[`s:${conn.id}:${shared.stream}`]?.label ?? shared.label ?? shared.stream,
      rangeSeconds: shared.seconds ?? get().settings.results.defaultRangeSeconds,
    });
  },

  openQuery: ({ connId, streamId, query, minutes }) => {
    const label = get().nodes[`s:${connId}:${streamId}`]?.label ?? streamId;
    runSomewhere(set, get, {
      name: query || "*",
      query,
      connId,
      streamIds: [streamId],
      streamLabel: label,
      rangeSeconds: minutes ? minutes * 60 : get().settings.results.defaultRangeSeconds,
    });
  },

  clearHistory: () => {
    set({ history: [] });
    persist(get);
  },

  openSource: (tabId, ref) => {
    const { tabs, settings, projectFolders } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    // its folder is this machine's checkout of it
    const project = projectOf(settings.projects, tab);
    const folder = project ? projectFolders[project.id] : undefined;
    if (!project || !folder) {
      return get().notify(
        "info",
        `${ref.path.split("/").pop()}:${ref.line}`,
        project
          ? `Where is ${project.name} checked out? Its folder is not set.`
          : "This stream is in no project, so there is no checkout to open it in.",
        [{ label: "Open Settings", run: () => get().setShowSettings(true, "projects") }],
      );
    }
    const file = localPath(ref.path, folder, project.sourcePrefix);
    void openUrl(ideUrl(settings.editor.ide, file, ref.line)).catch((e: unknown) =>
      get().notify("error", `Could not open ${ideName(settings.editor.ide)}`, failureReason(e)),
    );
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
    const query = searchOf(tab);

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
        // the timeline is counts of these same messages, and they carry when they arrived
        histogram:
          current.histogram &&
          bucketed(
            current.histogram,
            fresh.map((r) => String(r.timestamp)),
          ),
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

  /** Counting templates needs no second search: the clause is enough for the table to appear. */
  showPatterns: (tabId, field) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    get().patchTab(tabId, { query: withPatterns(tab.query, true, field) });
  },

  /**
   * One request, end to end. A service writes to its own stream, so the story of a request is
   * spread across all of them: this searches every stream of the connection for the id the row
   * carries, oldest first, with the stream each line came from beside it.
   */
  setTraceDraft: (traceDraft) => set({ traceDraft }),

  investigate: async (tabId, row) => {
    const { tabs, settings, projectFolders } = get();
    const tab = tabs.find((t) => t.id === tabId);
    const conn = settings.connections.find((c) => c.id === tab?.connId);
    if (!tab || !conn) return;
    const id = crypto.randomUUID();
    const message = String(row[messageField(Object.keys(row))] ?? row.message ?? "");
    const at = String(row.timestamp ?? new Date().toISOString());
    const subject = { stream: tab.streamLabel, at, level: row.level != null ? String(row.level) : undefined, message };
    set({ investigation: { id, tabId, connId: conn.id, row, evidence: { subject }, pending: ["trace", "frequency", "spread", "code", "merges"] } });

    // each part lands when it is ready, so the window fills in rather than waiting on the slowest
    const land = (part: string, patch: Partial<Evidence>) => {
      const now = get().investigation;
      if (now?.id !== id) return;
      set({ investigation: { ...now, evidence: { ...now.evidence, ...patch }, pending: now.pending.filter((p) => p !== part) } });
    };
    const client = clientFor(conn);
    const shell = (command: string) =>
      invoke<string>("terminal_run", { program: settings.terminal.shell.trim(), args: ["-l", "-c", command] }).catch(() => "");
    const centre = Number.isNaN(Date.parse(at)) ? new Date() : new Date(at);
    const day = absolute(new Date(Date.now() - 86_400_000), new Date());
    // the message's own words are on its first line; what follows is usually a stack trace
    const said = templateOf(message.split("\n")[0]);
    const literal = literalsOf(said)[0];
    const phrase = literal ? `"${literal.replace(/(["\\])/g, "\\$1")}"` : null;
    const project = projectOf(settings.projects, tab);
    const folder = project ? projectFolders[project.id] : undefined;

    // the request across every service: by its id, wherever each service keeps it
    const trace = async () => {
      const found = correlationOf(row);
      if (!found) return land("trace", {});
      const name = leaf(found.field);
      const value = found.value.replace(/(["\\])/g, "\\$1");
      const [streams, page] = await Promise.all([
        client.streams(),
        client.messages({
          query: `${name}:"${value}" OR context.${name}:"${value}" OR "${value}"`,
          streams: [],
          timerange: absolute(new Date(centre.getTime() - 1800_000), new Date(centre.getTime() + 1800_000)),
          fields: ["timestamp", "streams", "source", "level", "message", "httpStatusCode", "status", found.field],
          size: 300,
          sortOrder: "asc",
        }),
      ]);
      const titles = new Map(streams.map((st) => [st.id, st.title]));
      const named: Record<string, unknown>[] = page.rows.map((r) => ({ ...r, streams: titleOf(r.streams, titles) }));
      const journey = journeyOf(named, found.value);
      const failures = journey
        ? journey.lanes
            .flatMap((l) =>
              l.points
                .filter((p) => p.error)
                .map((p) => ({ at: new Date(p.at).toISOString(), stream: l.stream, message: String(named[p.index].message ?? "") })),
            )
            .sort((a, b) => a.at.localeCompare(b.at))
        : [];
      land("trace", {
        trace: {
          field: found.field,
          value: found.value,
          lanes: journey?.lanes.map((l) => ({ stream: l.stream, lines: l.points.length, errors: l.errors })) ?? [],
          failures,
        },
      });
    };

    // how often the same message is written, and since when
    const frequency = async () => {
      if (!phrase) return land("frequency", {});
      const hour = absolute(new Date(Date.now() - 3600_000), new Date());
      const [lastHour, lastDay, oldest] = await Promise.all([
        client.count({ query: phrase, streams: tab.streamIds, timerange: hour }),
        client.count({ query: phrase, streams: tab.streamIds, timerange: day }),
        client.messages({ query: phrase, streams: tab.streamIds, timerange: day, fields: ["timestamp"], size: 1, sortOrder: "asc" }),
      ]);
      land("frequency", {
        frequency: { pattern: said, lastHour, lastDay, firstSeen: oldest.rows[0]?.timestamp as string | undefined },
      });
    };

    // who else it hits, and what they have in common
    const spread = async () => {
      if (!phrase) return land("spread", {});
      const sample = await client.messages({
        query: phrase,
        streams: tab.streamIds,
        timerange: day,
        fields: tab.fields.length ? tab.fields.map((f) => f.name) : tab.columns,
        size: 500,
      });
      const kinds = sample.rows.map((r) => correlationOf(r)).filter((c): c is NonNullable<typeof c> => !!c);
      const kind = kinds[0] ? NAMES.findIndex((n) => n.test(leaf(kinds[0].field))) : -1;
      const ids = new Set(kinds.filter((c) => leaf(c.field) === leaf(kinds[0]?.field ?? "")).map((c) => c.value));
      const shared = candidateFields(sample.rows)
        .map((field) => {
          const counts = new Map<string, number>();
          for (const r of sample.rows) if (r[field] != null && r[field] !== "") counts.set(String(r[field]), (counts.get(String(r[field])) ?? 0) + 1);
          const [value, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
          return { field, value, share: sample.rows.length ? n / sample.rows.length : 0 };
        })
        .filter((s) => s.share >= 0.6 && s.share < 1)
        .sort((a, b) => b.share - a.share)
        .slice(0, 3);
      land("spread", { spread: { sampled: sample.rows.length, ids: ids.size, idKind: kind >= 0 ? `${NAME_LABELS[kind]}s` : undefined, shared } });
    };

    // the line that wrote it: from the stack trace when there is one, by its words when not
    const code = async () => {
      if (!project || !folder) return land("code", {});
      const ref = sourceRefs(`${message}\n${JSON.stringify(row)}`).find((r) => !r.path.includes("vendor/"));
      let hit: Hit | undefined;
      let from: "stack" | "search" = "stack";
      if (ref) {
        const file = localPath(ref.path, folder, project.sourcePrefix);
        const relative = file.startsWith(folder) ? file.slice(folder.replace(/\/+$/, "").length + 1) : file;
        const text = (await shell(`sed -n '${ref.line}p' ${shellWord(file)}`)).trim();
        hit = { file: relative, line: ref.line, text };
      } else {
        from = "search";
        const found = (await Promise.all(literalsOf(said).map((l) => shell(grepCommand(folder, l))))).flatMap(readGrep);
        hit = rank(found)[0];
      }
      if (!hit) return land("code", {});
      const blame = readBlame(await shell(blameCommand(folder, hit)));
      const pr = blame && project.github ? readPr(await shell(prCommand(project.github, blame.sha))) : null;
      land("code", { code: { ...hit, from, blame: blame ?? undefined, pr: pr ?? undefined } });
    };

    // what was merged lately: the usual suspect
    const merges = async () => {
      if (!project?.github) return land("merges", {});
      const out = await shell(mergesCommand(project.github, new Date(Date.now() - 2 * 86_400_000), new Date()));
      land("merges", { merges: readMerges(out).reverse() });
    };

    await Promise.all(Object.entries({ trace, frequency, spread, code, merges }).map(([part, run]) => run().catch(() => land(part, {}))));
  },

  openServiceMap: async (connId, seconds) => {
    const conn = get().settings.connections.find((c) => c.id === connId);
    if (!conn) return;
    const window = seconds ?? get().serviceMap?.seconds ?? 3600;
    const was = get().serviceMap?.connId === connId ? get().serviceMap : null;
    set({ serviceMap: { connId, seconds: window, rows: was?.rows ?? [], titles: was?.titles ?? {}, running: true } });
    const client = clientFor(conn);
    try {
      const streams = await client.streams();
      const to = new Date();
      const page = await client.messages({
        query: mapFields()
          .map((f) => `_exists_:${f}`)
          .join(" OR "),
        streams: [],
        timerange: absolute(new Date(to.getTime() - window * 1000), to),
        fields: ["timestamp", "streams", "source", "level", "httpStatusCode", "status", ...mapFields()],
        size: 5000,
      });
      if (get().serviceMap?.connId !== connId) return;
      set({
        serviceMap: { connId, seconds: window, rows: page.rows, titles: Object.fromEntries(streams.map((st) => [st.id, st.title])), at: Date.now() },
      });
    } catch (e) {
      if (get().serviceMap?.connId !== connId) return;
      set({ serviceMap: { connId, seconds: window, rows: [], titles: {}, error: failureReason(e) } });
    }
  },

  whereLogged: async (tabId, template) => {
    const { tabs, settings, projectFolders } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const project = projectOf(settings.projects, tab);
    const folder = project ? projectFolders[project.id] : undefined;
    const base = { template, folder: folder ?? "", repo: project?.github, hits: [] as Hit[] };
    if (!project || !folder) {
      return set({
        located: {
          ...base,
          error: project
            ? `Where is ${project.name} checked out? Set its folder in Settings › Projects, and this searches it.`
            : "This stream is in no project, so there is no checkout to search.",
        },
      });
    }
    const literals = literalsOf(template);
    if (!literals.length) {
      return set({
        located: { ...base, error: "The message is mostly values filled in at run time: too little of it is literal text to find in the code." },
      });
    }
    set({ located: { ...base, literals, running: true } });
    const shell = (command: string) =>
      invoke<string>("terminal_run", { program: settings.terminal.shell.trim(), args: ["-l", "-c", command] }).catch(() => "");
    // git grep answers nothing at all when it finds nothing, which is an answer too
    const found = (await Promise.all(literals.map((l) => shell(grepCommand(folder, l))))).flatMap(readGrep);
    const seen = new Set<string>();
    const hits = rank(found.filter((h) => !seen.has(`${h.file}:${h.line}`) && seen.add(`${h.file}:${h.line}`))).slice(0, 12);
    if (get().located?.template !== template) return;
    set({ located: { ...base, literals, hits, selected: hits.length ? 0 : undefined } });
    if (hits.length) await get().blameHit(0);
  },

  blameHit: async (index) => {
    const located = get().located;
    const hit = located?.hits[index];
    if (!located || !hit) return;
    set({ located: { ...located, selected: index, blame: undefined, pr: undefined, blaming: true } });
    const shell = (command: string) =>
      invoke<string>("terminal_run", { program: get().settings.terminal.shell.trim(), args: ["-l", "-c", command] }).catch(() => "");
    const blame = readBlame(await shell(blameCommand(located.folder, hit)));
    const pr = blame && located.repo ? readPr(await shell(prCommand(located.repo, blame.sha))) : null;
    const now = get().located;
    if (now?.template !== located.template || now.selected !== index) return;
    set({ located: { ...now, blame: blame ?? undefined, pr: pr ?? undefined, blaming: false } });
  },

  traceId: async (connId, value, seconds) => {
    const conn = get().settings.connections.find((c) => c.id === connId);
    const to = new Date();
    await followAcross(set, get, conn, { value: value.trim(), window: { from: new Date(to.getTime() - seconds * 1000), to }, trace: true });
  },

  explainRange: async (tabId, from, to) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    const conn = get().settings.connections.find((c) => c.id === tab?.connId);
    if (!tab || !conn) return;
    const window = { from: from.toISOString(), to: to.toISOString() };
    get().patchTab(tabId, { explain: { ...window, running: true, rows: [], asked: [] } });
    const task = get().startTask("Explaining the stretch");
    const client = clientFor(conn);
    const query = searchOf(tab);
    const before = baselineOf(from, to);
    const inside = absolute(from, to);
    let fields: string[] = [];
    const grouped = (field: string, range: TimeRange) =>
      client
        .aggregate({ query, streams: tab.streamIds, timerange: range, groupBy: [{ field, limit: 20 }], metrics: [{ function: "count" }] })
        .then((r) => r.rows.map((row) => ({ value: String(row[0] ?? ""), count: Number(row[row.length - 1]) || 0 })));
    try {
      // the fields worth asking about come from a sample of the stretch with every field in it:
      // the page on screen carries only its columns, which is rarely where the answer is
      const sample = await client.messages({
        query,
        streams: tab.streamIds,
        timerange: inside,
        // before the stream's fields have loaded, the columns are what there is to ask for
        fields: tab.fields.length ? tab.fields.map((f) => f.name) : tab.columns,
        size: 200,
      });
      fields = candidateFields(sample.rows);
      if (!fields.length) throw new Error("The stretch carries no field with a handful of values to compare.");
      get().patchTab(tabId, { explain: { ...window, running: true, rows: [], asked: fields } });
      const earlier = absolute(before.from, before.to);
      const [totalIn, totalBefore] = await Promise.all([
        client.count({ query, streams: tab.streamIds, timerange: inside }),
        client.count({ query, streams: tab.streamIds, timerange: earlier }),
      ]);
      // four at a time, so a dozen fields do not arrive at the source as two dozen searches at
      // once; a field that cannot be grouped by fails on its own and is left out of the answer
      const settled = await inTurn(fields, 4, (field) =>
        Promise.all([grouped(field, inside), grouped(field, earlier)])
          .then(([now, then]): [Counted, Counted] => [
            { field, total: totalIn, values: now },
            { field, total: totalBefore, values: then },
          ])
          .catch(() => null),
      );
      const pairs = settled.filter((p): p is [Counted, Counted] => !!p);
      if (get().tabs.find((t) => t.id === tabId)?.explain?.from !== window.from) return;
      get().patchTab(tabId, {
        explain: {
          ...window,
          rows: explain(
            pairs.map((p) => p[0]),
            pairs.map((p) => p[1]),
          ),
          asked: fields,
        },
      });
    } catch (e) {
      get().patchTab(tabId, { explain: { ...window, rows: [], asked: fields, error: failureReason(e) } });
    } finally {
      get().endTask(task);
    }
  },

  followRequest: async (tabId, row, field) => {
    const found = correlationOf(row, field);
    if (!found) {
      return get().notify("info", "Follow this request", "This row carries no id to follow: no trace, request, correlation or order id.");
    }
    const conn = get().settings.connections.find((c) => c.id === get().tabs.find((t) => t.id === tabId)?.connId);
    await followAcross(set, get, conn, { ...found, at: String(row.timestamp ?? "") });
  },

  /**
   * Something pointed at in the inspector. A key that is a field of the message is followed
   * as that field; anything else — a key inside a JSON blob, a selection — is followed as the
   * text it is, which is what Graylog searches the message for anyway.
   */
  followValue: async (tabId, value, field) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    const row = tab?.selectedRow != null ? tab.page?.rows[tab.selectedRow] : undefined;
    const known = field && row && field in row ? field : undefined;
    const conn = get().settings.connections.find((c) => c.id === tab?.connId);
    await followAcross(set, get, conn, { field: known, value, at: String(row?.timestamp ?? "") });
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

  addSavedQueries: (queries) => {
    if (!queries.length) return;
    set({ savedQueries: [...queries, ...get().savedQueries] });
    void saveQueries(get().savedQueries, get().workspaceFolder);
  },

  renameSavedQuery: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({ savedQueries: get().savedQueries.map((q) => (q.id === id ? { ...q, name: trimmed } : q)) });
    void saveQueries(get().savedQueries, get().workspaceFolder);
  },

  toggleWatch: (id) => {
    const watched = get().savedQueries.map((q) => (q.id === id ? { ...q, watch: !q.watch } : q));
    set({ savedQueries: watched });
    // a watch starts now: what happened before it was turned on is not news
    watching.set(id, Date.now());
    void saveQueries(get().savedQueries, get().workspaceFolder);
  },

  keepSavedQuery: (entry) => {
    const { [entry.id]: _was, ...rest } = get().watchLog;
    void _was;
    set({ savedQueries: upsert(get().savedQueries, entry), rightTool: "queries", watchLog: rest });
    // a watch starts now: what happened before it was set is not news
    if (entry.watch) watching.set(entry.id, Date.now());
    void saveQueries(get().savedQueries, get().workspaceFolder);
  },

  setWatchInterval: (id, seconds) => {
    set({ savedQueries: get().savedQueries.map((q) => (q.id === id ? { ...q, watch: true, watchSeconds: seconds } : q)) });
    void saveQueries(get().savedQueries, get().workspaceFolder);
  },

  setWatchLevel: (id, level) => {
    set({ savedQueries: get().savedQueries.map((q) => (q.id === id ? { ...q, watch: true, level } : q)) });
    void saveQueries(get().savedQueries, get().workspaceFolder);
  },

  setWatchQuiet: (id, below) => {
    const { [id]: _was, ...rest } = get().watchLog;
    void _was;
    // a watch that changes what it listens for starts over, quiet or not
    set({ savedQueries: get().savedQueries.map((q) => (q.id === id ? { ...q, watch: true, quietBelow: below } : q)), watchLog: rest });
    void saveQueries(get().savedQueries, get().workspaceFolder);
  },

  /**
   * What has arrived since the last round, for each watched query. It is a count rather than a
   * search — the cheapest question Graylog answers about a query — and the window it counts
   * over starts where the last one ended, so nothing is reported twice or missed between them.
   */
  checkWatches: async () => {
    const fallback = get().settings.advanced.watchSeconds;
    const at = Date.now();
    // each query keeps its own clock, so the window can hold one query looking every fifteen
    // seconds and another every quarter of an hour
    const owed = get().savedQueries.filter((q) => due(watching.get(q.id), at, watchEvery(q, fallback)));
    await Promise.all(
      owed.map(async (q) => {
        const conn = get().settings.connections.find((c) => c.id === q.connId);
        const parsed = parseQuery(q.query);
        // a fixed window has nothing new in it, ever
        if (!conn || parsed.between) return;
        const to = new Date();
        // new matches are counted since the last round; silence is counted over a whole round,
        // or the first one, which starts now, would always be quiet
        const since = q.quietBelow ? to.getTime() - watchEvery(q, fallback) * 1000 : (watching.get(q.id) ?? Date.now());
        watching.set(q.id, to.getTime());
        const asked = clientFor(conn).count({
          query: parsed.search || "*",
          streams: q.streamIds,
          timerange: absolute(new Date(since), to),
          signal: AbortSignal.timeout(20_000),
        });
        if (q.quietBelow) {
          // a round that could not be asked is not silence: it says nothing either way
          const found = await asked.catch(() => null);
          if (found == null) return;
          const verdict = quietVerdict(found, q.quietBelow, !!get().watchLog[q.id]?.quiet);
          const quiet = verdict ? verdict === "quiet" : !!get().watchLog[q.id]?.quiet;
          set({ watchLog: { ...get().watchLog, [q.id]: { at: to.getTime(), found, quiet } } });
          if (!verdict) return;
          const window = shortSpan(watchEvery(q, fallback));
          const message =
            verdict === "quiet"
              ? `Only ${found.toLocaleString()} on ${q.streamLabel} in the last ${window}, fewer than ${q.quietBelow.toLocaleString()}`
              : `${found.toLocaleString()} on ${q.streamLabel} in the last ${window}: arriving again`;
          const level = verdict === "quiet" ? (q.level ?? "warning") : "info";
          const { mark, sound } = alarm(level, get().settings.advanced.watchSound);
          get().notify(level, q.name, message, [{ label: "Open", run: () => get().openSavedQuery(q.id) }]);
          void announce(`${mark} ${q.name}`, message, sound).catch(() => {});
          return;
        }
        const found = await asked.catch(() => 0);
        set({ watchLog: { ...get().watchLog, [q.id]: { at: to.getTime(), found } } });
        if (!found) return;
        const message = `${found.toLocaleString()} new ${found === 1 ? "match" : "matches"} on ${q.streamLabel}`;
        const { mark, sound } = alarm(q.level, get().settings.advanced.watchSound);
        get().notify(q.level ?? "warning", q.name, message, [{ label: "Open", run: () => get().openSavedQuery(q.id) }]);
        void announce(`${mark} ${q.name}`, message, sound).catch(() => {});
      }),
    );
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
    set({ showTerminal: !get().showTerminal, showEndpoints: false });
    persist(get);
  },

  setView: (view) => set((s) => ({ view, returns: s.view === "monitor" && view === "explorer" ? s.returns + 1 : s.returns })),
  setMonitorScope: (monitorScope) => set({ monitorScope }),

  toggleEndpoints: () => set({ showEndpoints: !get().showEndpoints, showTerminal: false }),

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
  cancelQuery: (tabId) => running.get(tabId)?.abort(),

  noteCommand: (terminal, command, code, ms) => {
    const at = Date.now();
    set({ commandDone: { terminal, command, code, ms, at } });
    setTimeout(() => get().commandDone?.at === at && set({ commandDone: undefined }), 15_000);
  },

  muteIsland: (minutes) => {
    if (minutes === null) return set({ islandMutedUntil: undefined });
    const until = Date.now() + minutes * 60_000;
    set({ islandMutedUntil: until });
    setTimeout(() => get().islandMutedUntil === until && set({ islandMutedUntil: undefined }), minutes * 60_000);
    get().notify("info", "The island is muted", `It comes back in ${minutes} minutes.`, [{ label: "Unmute", run: () => get().muteIsland(null) }]);
  },

  noteMcpCall: (tool, detail, failed) => {
    const at = Date.now();
    set({ mcpCall: { tool, detail, failed, at } });
    setTimeout(() => get().mcpCall?.at === at && set({ mcpCall: undefined }), 8000);
  },

  startTask: (title, cancel) => {
    const id = crypto.randomUUID();
    set({ tasks: [...get().tasks, { id, title, cancel }] });
    return id;
  },
  setTaskProgress: (id, progress) => set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, progress } : t)) }),
  endTask: (id) => set({ tasks: get().tasks.filter((t) => t.id !== id) }),

  notify: (kind, title, message, actions) => {
    const notice = { id: crypto.randomUUID(), kind, title, message, actions, at: Date.now() };
    // the balloon goes; the centre keeps it, because a balloon missed is a balloon lost
    set({ notices: withNotice(get().notices, notice), noticeLog: [notice, ...get().noticeLog].slice(0, 200) });
  },

  clearNotices: () => set({ noticeLog: [] }),
  dropNotice: (id) => set({ noticeLog: get().noticeLog.filter((n) => n.id !== id) }),
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
      get().notify("info", `Flux ${manifest.version} is available`, "Changelog is available.", [
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
    const conn = get().settings.connections.find((c) => c.id === tab.connId);
    get().patchTab(tabId, { layout: undefined, columns: defaultColumns(conn) });
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
    patchTab(id, { running: true, error: undefined, startedAt: Date.now(), zero: undefined });
    const stop = new AbortController();
    running.set(id, stop);
    const task = get().startTask(`Running the query on ${tab.streamLabel}`, () => stop.abort());
    const started = performance.now();
    try {
      const parsed = parseQuery(tab.query);
      const to = new Date();
      const query = searchOf(tab);
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
      // an endpoint's console draws how it behaved rather than only how much it said: the same
      // buckets, with the 95th percentile of its duration and the share that failed
      const map = tab.endpoint ? inferMapping(tab.fields) : null;
      const interval = bucketFor(
        parsed.between ? Math.max(1, (new Date(parsed.between.to).getTime() - new Date(parsed.between.from).getTime()) / 1000) : tab.rangeSeconds,
      );
      const timeline =
        settings.results.timeline && map?.duration
          ? client
              .latency({
                query,
                errorQuery: map.status ? `${query} AND ${map.status}:>=500` : undefined,
                durationField: map.duration,
                streams: tab.streamIds,
                timerange,
                interval,
                signal: stop.signal,
              })
              .catch(() => [])
          : settings.results.timeline
            ? client
                .histogram({
                  query,
                  streams: tab.streamIds,
                  timerange,
                  interval,
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
          sortOrder: tab.sortOrder,
          signal: stop.signal,
        }),
        // the rows are the answer; a total that will not come is a number missing from the
        // footer, not a query that failed
        client.count({ query, streams: tab.streamIds, timerange, signal: stop.signal }).catch(() => 0),
        Promise.all(grouped),
        timeline,
      ]);
      // what was run is worth keeping whether or not it was worth saving
      set({
        history: rememberQuery(get().history, {
          id: crypto.randomUUID(),
          query: tab.query,
          connId: tab.connId,
          streamIds: tab.streamIds,
          streamLabel: tab.streamLabel,
          rangeSeconds: tab.rangeSeconds,
          at: now(),
          rows: total || page.rows.length,
        }),
      });
      // what was merged meanwhile arrives when it arrives; the rows do not wait for it
      if (histogram.length) void mergesFor(settings, tab, histogram).then((markers) => patchTab(id, { markers }));
      patchTab(id, {
        page,
        histogram: histogram.length ? histogram.map((b) => (b.p95 != null && map?.durationIsSeconds ? { ...b, p95: b.p95 * 1000 } : b)) : undefined,
        tail: undefined,
        groups: groups.length ? groups : undefined,
        total: total || undefined, // a count that failed comes back as zero, and zero rows say so themselves
        took: Math.round(performance.now() - started),
        running: false,
        selectedRow: undefined,
        zero: undefined,
      });
      // nothing found is the start of a question, so the answer to it starts by itself
      if (!page.rows.length && (tab.offset ?? 0) === 0 && parsed.search) void diagnoseEmpty(get, id, timerange);
    } catch (e) {
      if (stop.signal.aborted) patchTab(id, { running: false });
      else {
        patchTab(id, { error: errorText(e), running: false, page: undefined, groups: undefined, histogram: undefined });
        get().notify("error", conn.name || conn.url, `Query failed: ${failureReason(e)}`);
      }
    } finally {
      if (running.get(id) === stop) running.delete(id);
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

export interface Investigation {
  id: string;
  tabId: string;
  connId: string;
  row: Record<string, unknown>;
  evidence: Evidence;
  /** The parts still being looked for. */
  pending: string[];
}

/** A stream named by its title, where a source answers with ids. */
function titleOf(streams: unknown, titles: Map<string, string>): string {
  const list = Array.isArray(streams) ? streams.map(String) : streams ? [String(streams)] : [];
  return list.map((s) => titles.get(s) ?? s).join(", ") || "unknown";
}

/** A path as one word of a shell command. */
function shellWord(s: string): string {
  return /^[\w./@-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

export interface MapSample {
  connId: string;
  /** How far back the sample reaches, and when it was taken. */
  seconds: number;
  at?: number;
  running?: boolean;
  rows: Record<string, unknown>[];
  /** A stream's name by its id, for a source whose rows name streams by id. */
  titles: Record<string, string>;
  error?: string;
}

/**
 * The fields an id is kept in, asked for by name since Graylog answers only what it is asked:
 * the usual names, and the same inside Laravel's context.
 * ponytail: a sample of the newest 5,000 such lines in the window; on a busy connection that is
 * the last minutes of it, which is enough to draw the map but not to count a day.
 */
const mapFields = () =>
  ["request_id", "requestId", "trace_id", "traceId", "correlation_id", "order_id", "orderId", ...customFields()].flatMap((f) => [f, `context.${f}`]);

export interface Located {
  template: string;
  /** The project's checkout, and the repository its pull requests are in. */
  folder: string;
  repo?: string;
  literals?: string[];
  hits: Hit[];
  selected?: number;
  running?: boolean;
  blaming?: boolean;
  blame?: Blame;
  pr?: { number: number; title: string; url: string };
  error?: string;
}

export interface Zero {
  running?: boolean;
  /** How many messages the window holds with no search at all. */
  everything?: number;
  terms: { term: string; without?: number; field?: string; known?: boolean; suggest?: string }[];
}

/**
 * Each term of an empty search left out in turn and the rest counted, and each field it names
 * checked against the stream's. The term whose absence brings rows back is the wrong one; a
 * window that is empty with no search at all is no term's fault.
 */
async function diagnoseEmpty(get: Getter, tabId: string, timerange: TimeRange): Promise<void> {
  const tab = get().tabs.find((t) => t.id === tabId);
  const conn = get().settings.connections.find((c) => c.id === tab?.connId);
  if (!tab || !conn) return;
  const terms = andTerms(parseQuery(tab.query).search).slice(0, TERMS);
  const known = tab.fields.map((f) => f.name);
  const checked = terms.map((term) => {
    const field = fieldOf(term) ?? undefined;
    return { term, ...(field ? { field, ...checkField(field, known) } : {}) };
  });
  get().patchTab(tabId, { zero: { running: true, terms: checked } });
  const client = clientFor(conn);
  // the rest of the console's search — the endpoint it is on — stays in every count
  const around = (search: string) => searchOf({ ...tab, query: withSearch(tab.query, search) });
  const count = (search: string) =>
    client.count({ query: around(search), streams: tab.streamIds, timerange, signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
  const [everything, counted] = await Promise.all([
    count("*"),
    terms.length > 1 ? inTurn(terms, 4, (_, i) => count(without(terms, i))) : Promise.resolve([] as (number | undefined)[]),
  ]);
  // a newer run has its own answer to give
  if (get().tabs.find((t) => t.id === tabId)?.zero?.running !== true) return;
  get().patchTab(tabId, { zero: { everything, terms: checked.map((t, i) => ({ ...t, without: counted[i] })) } });
}

/** A round's length the way a sentence says it: `30 seconds`, `5 minutes`, `an hour`. */
function shortSpan(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return seconds === 60 ? "minute" : `${Math.round(seconds / 60)} minutes`;
  return seconds === 3600 ? "hour" : `${Math.round(seconds / 3600)} hours`;
}

/** `work` over each item, at most `width` at a time, the answers in the items' order. */
async function inTurn<T, R>(items: T[], width: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, lane));
  return out;
}

/** What a console asks the source: its search, inside the endpoint it was opened on. */
export function searchOf(tab: Tab): string {
  const clauses = [parseQuery(tab.query).search].filter(Boolean);
  if (tab.endpoint) clauses.push(endpointClause(tab.endpoint));
  return clauses.length ? clauses.map((c) => `(${c})`).join(" AND ") : "*";
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

/** A row picked for comparing, with enough to say where it came from. */
export interface Pick {
  key: string;
  row: Record<string, unknown>;
  title: string;
  at: string;
}

/** What makes a picked row that one: its tab, and the message's own identity. */
export const pickKey = (tab: Tab, row: Record<string, unknown>) => `${tab.id}|${rowKey(row)}`;

/** The tab as a `flux://` link, when it names one stream. */
function viewLink(get: Getter, tab: Tab): string | undefined {
  const conn = get().settings.connections.find((c) => c.id === tab.connId);
  if (!conn || tab.streamIds.length !== 1) return undefined;
  return linkFor({ graylog: conn.url, stream: tab.streamIds[0], label: tab.streamLabel, query: tab.query, seconds: tab.rangeSeconds });
}

/**
 * Jira's create screen with the draft in it. Without a project id it can only open the empty
 * screen, so the draft goes to the clipboard to be pasted there, and says so.
 */
function openIssue(get: Getter, draft: Draft): void {
  const made = issueUrl(get().settings.jira, draft);
  if (!made) {
    return get().notify("info", "Jira is not set up", "Give Flux your Jira site, and the project to file into.", [
      { label: "Open Settings", run: () => get().setShowSettings(true, "jira") },
    ]);
  }
  if (!made.filled) {
    void navigator.clipboard.writeText(`${draft.summary}\n\n${draft.description}`);
    get().notify("info", "The issue is on the clipboard", "No project is set in Settings › Jira, so paste it into the screen that opened.");
  }
  void openUrl(made.url).catch((e: unknown) => get().notify("error", "Could not open Jira", failureReason(e)));
}

/** The project a tab is looking at: whichever one its streams belong to. */
function projectOf(projects: Settings["projects"], tab: Tab) {
  return projects.find((p) => p.connectionId === tab.connId && p.streams.some((s) => tab.streamIds.includes(s)));
}

/**
 * The pull requests merged into the tab's repository across the timeline, through `gh` in the
 * login shell. Anything that goes wrong — no repository, no `gh`, not signed in — is no markers.
 */
async function mergesFor(settings: Settings, tab: Tab, buckets: Bucket[]): Promise<Marker[]> {
  const repo = projectOf(settings.projects, tab)?.github;
  if (!repo || !settings.results.deployMarkers || buckets.length < 2) return [];
  const from = new Date(buckets[0].at);
  const step = new Date(buckets[1].at).getTime() - from.getTime();
  const to = new Date(new Date(buckets[buckets.length - 1].at).getTime() + step);
  const out = await invoke<string>("terminal_run", {
    program: settings.terminal.shell.trim(),
    args: ["-l", "-c", mergesCommand(repo, from, to)],
  }).catch(() => "[]");
  return readMerges(out);
}

/** When each watched query was last asked, so the next round starts where this one ended. */
const watching = new Map<string, number>();

/** What makes a message that one: its id when Graylog gave one, its content when it did not. */

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
    columns: conn.columns?.length ? conn.columns : defaultColumns(conn),
    layout: conn.columns?.length ? conn.columns : undefined,
  };
}

/**
 * One console over every stream of a connection, for the hour around a message: a request
 * crosses services and each service writes to its own stream, so this is where its lines meet.
 * Without a field it is the value itself that is searched, which is how Graylog reads a bare
 * term against the message.
 */
async function followAcross(
  set: Setter,
  get: Getter,
  conn: Connection | undefined,
  o: { field?: string; value: string; at?: string; window?: { from: Date; to: Date }; trace?: boolean },
): Promise<void> {
  if (!conn || !identifying(o.value)) return;

  const label = o.field ?? (o.trace ? "trace" : "value");
  const task = get().startTask(`Following ${label} across ${conn.name || "the connection"}`);
  try {
    const streams = (await clientFor(conn).streams()).map((s) => s.id);
    const at = new Date(o.at ?? "");
    const centre = Number.isNaN(at.getTime()) ? new Date() : at;
    const clause = o.field ? fieldClause(o.field, o.value) : `"${o.value.replace(/(["\\])/g, "\\$1")}"`;
    // an hour either side: long enough for a retry, short enough to stay one story
    const window = o.window ?? { from: new Date(centre.getTime() - 3600_000), to: new Date(centre.getTime() + 3600_000) };
    const query = withBetween(clause, window.from, window.to);
    const id = `${o.trace ? "trace" : "follow"}:${conn.id}:${label}:${o.value}`;
    if (!get().tabs.some((t) => t.id === id)) {
      const next = blankTab(get().settings, conn, {
        id,
        title: `${label} ${o.value.slice(0, 12)}`,
        connId: conn.id,
        streamIds: streams,
        streamLabel: `${streams.length} streams`,
      });
      // which stream a line came from is the point of this tab, and oldest first is the order
      // a story is read in
      const columns = ["timestamp", "streams", "source", "level", "message"];
      set({
        tabs: [...get().tabs, { ...next, query, columns, layout: columns, sortOrder: "asc" as const, trace: o.trace ? o.value : undefined }],
        activeTab: id,
      });
      void loadFields(id, set, get);
    } else {
      set({ activeTab: id });
      get().patchTab(id, { query, offset: 0 });
    }
    await get().runQuery(id);
  } catch (e) {
    get().notify("error", "Follow", failureReason(e));
  } finally {
    get().endTask(task);
  }
}

/**
 * A query goes back to the console for the stream it belongs to, rather than landing in
 * whichever one happens to be in front. Saved and run-before both arrive here.
 */
function runSomewhere(
  set: Setter,
  get: Getter,
  q: { name: string; query: string; connId: string; streamIds: string[]; streamLabel: string; rangeSeconds: number },
  savedQueryId?: string,
): void {
  const conn = get().settings.connections.find((c) => c.id === q.connId);
  if (!conn) {
    return get().notify("error", q.name, "The connection this query was saved against is no longer set up.");
  }
  const tabId = q.streamIds[0] ? `s:${q.connId}:${q.streamIds[0]}` : `q:${savedQueryId ?? q.connId}`;
  if (!get().tabs.some((t) => t.id === tabId)) {
    const tab = blankTab(get().settings, conn, {
      id: tabId,
      title: q.streamLabel || q.name,
      connId: q.connId,
      streamIds: q.streamIds,
      streamLabel: q.streamLabel,
    });
    set({ tabs: [...get().tabs, tab], activeTab: tabId });
    void loadFields(tabId, set, get);
  } else {
    set({ activeTab: tabId });
  }
  get().patchTab(tabId, { query: q.query, rangeSeconds: q.rangeSeconds, savedQueryId, offset: 0 });
  void get().runQuery(tabId);
}

/** Keep an entry, point the tab at it, and show the panel it landed in. */
function keepQuery(set: Setter, get: Getter, tab: Tab, entry: SavedQuery): void {
  set({ savedQueries: upsert(get().savedQueries, entry), rightTool: "queries" });
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
  const {
    expanded,
    selectedNode,
    tabs,
    activeTab,
    terminals,
    activeTerminal,
    showTerminal,
    terminalSize,
    inspectorSize,
    queriesSize,
    rightTool,
    showFields,
    fieldsSize,
    projectFolders,
    history,
  } = get();
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
      queriesSize,
      rightTool,
      showFields,
      fieldsSize,
      projectFolders,
      history: history.slice(0, 100),
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
    queriesSize: w.queriesSize ?? 18,
    // sessions written before the dock held more than one tool said so with a boolean
    rightTool: w.rightTool ?? (w.showQueries ? "queries" : null),
    showFields: w.showFields ?? true,
    fieldsSize: w.fieldsSize ?? 34,
    history: w.history ?? [],
  });

  const live = new Set(chosenConnections(get().settings.connections, get().workspaceConnections).map((c) => c.id));
  const tabs: Tab[] = w.tabs
    .filter((t) => live.has(t.connId))
    .map((t) => ({
      ...t,
      running: false,
      fields: [],
      columns: t.columns?.length ? t.columns : defaultColumns(get().settings.connections.find((c) => c.id === t.connId)),
    }));
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
  const task = get().startTask(node.kind === "connection" ? `Connecting to ${conn.name || conn.url}` : `Loading ${node.label}`, () => stop.abort());
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
      get().notify("error", conn.name || conn.url, `${what}: ${failureReason(e)}`);
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
 * A stream's endpoints derived again from the source and written to the cache, which is what
 * Refresh does to a stream in the tree and to every stream in the Endpoints panel.
 */
export async function deriveEndpoints(conn: Connection, streamId: string, signal?: AbortSignal): Promise<EndpointRow[]> {
  const t = useApp.getState().settings.tree;
  const g = clientFor(conn);
  const fields = await g.fields(streamId, undefined, signal).catch(() => []);
  const rows = await endpointsFrom(g, streamId, fields, { lookbackHours: t.lookbackHours, limit: t.endpointLimit, signal });
  await cache.putStream(cache.cacheKey(conn.id), streamId, { endpoints: rows, fields });
  return rows;
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

  const rows = force || !cached?.endpoints ? await deriveEndpoints(conn, streamId, signal) : cached.endpoints;

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
