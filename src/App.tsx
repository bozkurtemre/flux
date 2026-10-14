import { useEffect, useRef, useState } from "react";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ConnectionExplorer } from "@/components/ConnectionExplorer";
import { EditorArea } from "@/components/EditorArea";
import { SearchEverywhere } from "@/components/SearchEverywhere";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { LeftStripe, RightStripe, StatusBar, TitleBar } from "@/components/Shell";
import { CompareWindow } from "./components/CompareWindow";
import { FieldsPanel } from "./components/FieldsPanel";
import { HelpWindow } from "./components/HelpWindow";
import { TraceDialog } from "./components/TraceDialog";
import { Onboarding } from "./components/Onboarding";
import { ReplayWindow } from "./components/ReplayWindow";
import { LocatedWindow } from "./components/LocatedWindow";
import { ServiceMapWindow } from "./components/ServiceMapWindow";
import { InvestigationWindow } from "./components/InvestigationWindow";
import { Island } from "./components/Island";
import { NotificationCenter } from "./components/NotificationCenter";
import { NameQuery, SavedQueries } from "./components/SavedQueries";
import { EndpointsPanel } from "./components/EndpointsPanel";
import { MonitorView } from "./components/MonitorView";
import { TerminalPanel } from "@/components/TerminalPanel";
import { Notifications } from "@/components/Notifications";
import { About } from "@/components/About";
import { UpdateNotes } from "@/components/UpdateNotes";
import { Tooltips } from "@/components/Tooltip";
import { ConfirmDialog } from "@/components/ContextMenu";
import { Checkbox } from "@/components/settings/controls";
import { quitAction } from "@/lib/terminal";
import { runTool, TOOLS, type View } from "@/lib/mcp";
import { parseQuery } from "@/lib/query";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { AUTH_CALLBACK } from "@/lib/cloud";
import { failureReason } from "@/lib/progress";
import { watchEvery } from "@/lib/queries";
import { promoter } from "@/lib/promoter";
import { tellShortcut, toldShortcuts } from "@/lib/settings";
import { clientFor } from "@/store";
import { useApp } from "@/store";

/** The tab in front, as the agent sees it through current_view: what it asks, and what is picked. */
function currentView(): View | null {
  const { tabs, activeTab, settings, nodes } = useApp.getState();
  const tab = tabs.find((t) => t.id === activeTab);
  if (!tab) return null;
  const parsed = parseQuery(tab.query);
  return {
    connection: settings.connections.find((c) => c.id === tab.connId)?.name ?? tab.connId,
    streams: tab.streamIds.map((id) => ({ id, title: nodes[`s:${tab.connId}:${id}`]?.label ?? tab.streamLabel })),
    query: tab.query,
    ...(parsed.between ? { between: parsed.between } : { minutes: Math.round(tab.rangeSeconds / 60) }),
    columns: tab.layout?.length ? tab.layout : (tab.page?.columns ?? []),
    rowsOnScreen: tab.page?.rows.length ?? 0,
    ...(tab.selectedRow != null && tab.page?.rows[tab.selectedRow] ? { selected: tab.page.rows[tab.selectedRow] } : {}),
  };
}

export default function App() {
  const {
    init,
    ready,
    showSettings,
    showSearch,
    activeTab,
    runQuery,
    settings,
    showTerminal,
    showEndpoints,
    view,
    showTour,
    terminalSize,
    setTerminalSize,
    rightTool,
    setQueriesSize,
    showFields,
    setFieldsSize,
  } = useApp();
  const terminalPanel = useRef<PanelImperativeHandle>(null);
  const queriesPanel = useRef<PanelImperativeHandle>(null);
  const fieldsPanel = useRef<PanelImperativeHandle>(null);
  const [askQuit, setAskQuit] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    void init().then(() => {
      if (useApp.getState().settings.updates.checkOnStartup) void useApp.getState().checkForUpdates(false);
    });
  }, [init]);

  // Cmd+Enter runs the active console, the JetBrains shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, .cm-editor") !== null;
      if (!typing) {
        const { move, expandSelected, openSelected } = useApp.getState();
        if (e.key === "ArrowDown") return (e.preventDefault(), move(1));
        if (e.key === "ArrowUp") return (e.preventDefault(), move(-1));
        if (e.key === "ArrowRight") return (e.preventDefault(), void expandSelected(true));
        if (e.key === "ArrowLeft") return (e.preventDefault(), void expandSelected(false));
        if (e.key === "Enter") return (e.preventDefault(), openSelected());
      }
      // ⌥⏎ investigates the selected row, as the IDE's ⌥⏎ offers what can be done about a line
      if (e.altKey && e.key === "Enter" && activeTab && !typing) {
        const app = useApp.getState();
        const tab = app.tabs.find((t) => t.id === activeTab);
        const row = tab?.selectedRow != null ? tab.page?.rows[tab.selectedRow] : undefined;
        if (row) {
          e.preventDefault();
          void app.investigate(activeTab, row);
          return;
        }
      }
      // the console has its own Mod-Enter; running it here as well would start the query twice
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && activeTab && !typing) {
        e.preventDefault();
        void runQuery(activeTab);
      }
      // Cmd+R re-runs the query rather than reloading the window, which is what the webview
      // would otherwise do with it.
      // ⌘1–⌘8 are the tabs in order and ⌘9 the last, as a browser's are
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const { tabs, setActive } = useApp.getState();
        const n = Number(e.key);
        const tab = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
        if (tab) {
          e.preventDefault();
          setActive(tab.id);
        }
      }
      // ⌘S keeps the query, as it saves a file everywhere else
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && activeTab) {
        e.preventDefault();
        useApp.getState().saveActiveQuery();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r" && activeTab) {
        e.preventDefault();
        void runQuery(activeTab);
      }
      // Escape closes the inspector, but only when it is the frontmost thing open
      if (e.key === "Escape" && !typing) {
        const app = useApp.getState();
        const covered =
          app.showSettings ||
          app.showSearch ||
          app.showAbout ||
          app.showUpdateNotes ||
          document.querySelector("[data-menu],[data-modal],[data-find]");
        const open = app.tabs.find((t) => t.id === app.activeTab);
        if (!covered && open?.selectedRow != null) app.patchTab(open.id, { selectedRow: undefined });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        useApp.getState().setShowSettings(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w" && activeTab) {
        e.preventDefault();
        useApp.getState().closeTab(activeTab);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        useApp.getState().setShowSearch(true);
      }
      // ⌥F12, the shortcut the modelled IDE gives its terminal
      if (e.altKey && e.key === "F12") {
        e.preventDefault();
        useApp.getState().toggleTerminal();
      }
      // the map of the connection in front, or of the first one there is
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        const app = useApp.getState();
        const conn = app.tabs.find((t) => t.id === app.activeTab)?.connId ?? app.settings.connections[0]?.id;
        if (conn) void app.openServiceMap(conn);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        useApp.getState().setTraceDraft("");
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        useApp.getState().setShowSearch(true, "endpoints");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, runQuery]);

  // the panel answers the stripe button, at the height it was left at; the terminal and Endpoints
  // take turns in it
  const bottomOpen = showTerminal || showEndpoints;
  useEffect(() => {
    const panel = terminalPanel.current;
    if (!panel) return;
    if (bottomOpen) {
      panel.expand();
      // a bare number is pixels to this library, and 32 pixels is below the minimum, which
      // collapsed the panel again the moment it was asked to open
      panel.resize(`${Math.min(80, Math.max(10, terminalSize))}%`);
    } else {
      panel.collapse();
    }
    // terminalSize is deliberately absent: dragging must not re-drive the panel it came from
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomOpen]);

  // the right tool window answers its stripe button the way the terminal answers its own
  useEffect(() => {
    const panel = queriesPanel.current;
    if (!panel) return;
    if (rightTool) {
      panel.expand();
      panel.resize(`${Math.min(40, Math.max(12, useApp.getState().queriesSize))}%`);
    } else {
      panel.collapse();
    }
  }, [rightTool]);

  // the fields panel answers its stripe button, at the height it was left at
  useEffect(() => {
    const panel = fieldsPanel.current;
    if (!panel) return;
    if (showFields) {
      panel.expand();
      panel.resize(`${Math.min(70, Math.max(10, useApp.getState().fieldsSize))}%`);
    } else {
      panel.collapse();
    }
  }, [showFields]);

  const onTerminalResize = (size: { asPercentage: number }) => {
    const { showTerminal, showEndpoints } = useApp.getState();
    if ((showTerminal || showEndpoints) && size.asPercentage > 1) setTerminalSize(size.asPercentage);
  };

  // Is each connection still there? The tree used to answer "whatever was loaded last", so a
  // connection nobody had expanded looked as dead as one that was. Half a minute apart, and
  // the cheapest request Graylog answers.
  const connectionIds = settings.connections.map((c) => c.id).join();
  useEffect(() => {
    void useApp.getState().checkConnections();
    const beat = setInterval(() => void useApp.getState().checkConnections(), 30_000);
    return () => clearInterval(beat);
  }, [connectionIds]);

  // Watched queries, every minute while the window is open. Nothing runs when Flux is closed —
  // there is no service behind it, and an alert that lies about that would be worse than none.
  // one heartbeat, and each watched query decides on it whether its own round is owed; the
  // beat does nothing at all when none of them is
  const watching = useApp((z) => z.savedQueries.some((q) => watchEvery(q, z.settings.advanced.watchSeconds) > 0));
  useEffect(() => {
    if (!watching) return;
    const beat = setInterval(() => void useApp.getState().checkWatches(), 5_000);
    return () => clearInterval(beat);
  }, [watching]);

  // `flux://open?…` links: the one Flux was started by, and any clicked while it is running.
  // The plugin hands both over as URLs; what they mean is decided in the store.
  useEffect(() => {
    if (!ready) return;
    // a sign-in link is the door's to answer, not a view to open
    const open = (urls: string[] | null) => urls?.filter((u) => !u.startsWith(AUTH_CALLBACK)).forEach((u) => useApp.getState().openLink(u));
    void getCurrent()
      .then(open)
      .catch(() => {});
    const stop = onOpenUrl(open);
    return () => void stop.then((unlisten) => unlisten()).catch(() => {});
  }, [ready]);

  // Once an hour, without saying anything unless it finds something. A log explorer left
  // open for a day should not have to be restarted to learn there is a new version.
  useEffect(() => {
    if (!settings.updates.checkOnStartup) return;
    const hourly = setInterval(() => void useApp.getState().checkForUpdates(false), 60 * 60 * 1000);
    return () => clearInterval(hourly);
  }, [settings.updates.checkOnStartup]);

  // A shortcut clicked with the mouse a third time is named once, in a tip. `detail` is 0 for a
  // button pressed from the keyboard, which needs no telling.
  useEffect(() => {
    let click: ((keys: string) => boolean) | undefined;
    let told: string[] = [];
    void toldShortcuts().then((t) => {
      told = t;
      click = promoter(t);
    });
    const onClick = (e: MouseEvent) => {
      const el = e.detail > 0 ? (e.target as Element | null)?.closest<HTMLElement>("[data-tip-key]") : null;
      const keys = el?.dataset.tipKey;
      if (!keys || !click?.(keys)) return;
      told = [...told, keys];
      void tellShortcut(told);
      const what = el.dataset.tip?.split(" — ")[0] ?? "This";
      useApp.getState().notify("info", `Tip: ${keys}`, `${what} has a shortcut: ${keys}.`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The MCP server runs in Rust and the tools run here, where Graylog is understood: a call
  // arrives as an event, is answered against the same client the window uses, and is handed
  // back by id. The server is started and stopped by the setting alone.
  useEffect(() => {
    const mcp = settings.mcp;
    const pending = listen<{ id: string; name: string; arguments: Record<string, unknown> }>("mcp-call", async (event) => {
      const current = useApp.getState().settings;
      const result = await runTool(event.payload.name, event.payload.arguments ?? {}, {
        connections: current.connections,
        clientFor,
        defaults: { minutes: 60, limit: current.results.pageSize },
        view: currentView,
        open: (o) => useApp.getState().openQuery(o),
      }).catch((e: unknown) => ({
        content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
        isError: true,
      }));
      // what was asked, never what came back: the island is on screen over every other app
      const detail = Object.entries(event.payload.arguments ?? {})
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" · ");
      useApp.getState().noteMcpCall(event.payload.name, detail, !!result.isError);
      await invoke("mcp_respond", { id: event.payload.id, result });
    });

    void (async () => {
      await invoke("mcp_set_tools", { tools: TOOLS });
      try {
        if (mcp.enabled && mcp.token) await invoke("mcp_start", { port: mcp.port, token: mcp.token });
        else await invoke("mcp_stop");
      } catch (e) {
        // a port already taken is the usual reason, and silence would leave the setting
        // ticked with nothing listening
        useApp.getState().notify("error", "MCP server", failureReason(e));
      }
    })();

    return () => void pending.then((stop) => stop());
  }, [settings.mcp]);

  // The application menu is built in Rust and answered here, where the windows are drawn.
  useEffect(() => {
    const app = useApp.getState();
    const pending = [
      listen("about", () => app.setShowAbout(true)),
      listen("check-updates", () => void app.checkForUpdates(true)),
      listen("settings", () => app.setShowSettings(true)),
    ];
    return () => void Promise.all(pending).then((stops) => stops.forEach((stop) => stop()));
  }, []);

  // Sessions outlive the app on purpose, so closing the window is a question, not a given.
  useEffect(() => {
    const win = getCurrentWindow();
    const pending = win.onCloseRequested((e) => {
      const { terminals, settings, tmuxMissing, killAllTerminals } = useApp.getState();
      const action = quitAction(settings.terminal.onQuit, terminals.length, settings.terminal.engine === "tmux" && !tmuxMissing);
      if (action === "leave") return;
      e.preventDefault(); // the answer needs a round trip, so the window waits for it
      if (action === "kill") {
        void killAllTerminals().then(() => win.destroy());
        return;
      }
      setAskQuit(true);
    });
    return () => void pending.then((stop) => stop());
  }, []);

  // a desktop app never shows the webview's own menu; text fields keep theirs
  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, .selectable, .cm-editor")) return;
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onMenu);
    return () => window.removeEventListener("contextmenu", onMenu);
  }, []);

  // double-Shift opens Search Everywhere, as in the IDE
  useEffect(() => {
    let last = 0;
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return (last = 0);
      const now = Date.now();
      if (now - last < 400) {
        last = 0;
        useApp.getState().setShowSearch(true);
      } else last = now;
    };
    window.addEventListener("keyup", onKeyUp);
    return () => window.removeEventListener("keyup", onKeyUp);
  }, []);

  // Following: every couple of seconds the active tab asks for what has arrived since its
  // newest message. Only the tab in front follows, because only it is being read.
  const following = useApp((z) => !!z.tabs.find((t) => t.id === z.activeTab)?.follow);
  useEffect(() => {
    if (!following || !activeTab) return;
    const tick = setInterval(() => void useApp.getState().tailTab(activeTab), 2000);
    return () => clearInterval(tick);
  }, [following, activeTab]);

  // Settings > Results > Auto-refresh re-runs the active tab on an interval
  const refreshEvery = settings.results.autoRefreshSeconds;
  useEffect(() => {
    if (!refreshEvery || !activeTab) return;
    const id = setInterval(() => void runQuery(activeTab), refreshEvery * 1000);
    return () => clearInterval(id);
  }, [refreshEvery, activeTab, runQuery]);

  if (!ready) return null;

  return (
    <div className="flex h-full flex-col p-1.5 pt-0" style={{ background: "var(--bg-window)" }}>
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <LeftStripe />
        <Group orientation="vertical" className="min-h-0 flex-1">
          <Panel minSize="20">
            {view === "monitor" && <MonitorView />}
            {/* hidden rather than unmounted: tabs, scroll and panel sizes are where they were */}
            <div className="h-full" style={{ display: view === "monitor" ? "none" : undefined }}>
              <Group orientation="horizontal" className="h-full min-h-0">
                <Panel defaultSize="26" minSize="14" maxSize="50">
                  <Group orientation="vertical" className="h-full min-h-0">
                    <Panel minSize="20">
                      <div className="island h-full">
                        <ConnectionExplorer />
                      </div>
                    </Panel>
                    <Separator className="h-1.5" style={{ display: showFields ? undefined : "none" }} />
                    {/* the fields of what is on screen, under the tree of what can be asked */}
                    <Panel
                      panelRef={fieldsPanel}
                      collapsible
                      collapsedSize={0}
                      defaultSize={0}
                      minSize="10"
                      maxSize="70"
                      onResize={(size) => useApp.getState().showFields && size.asPercentage > 1 && setFieldsSize(size.asPercentage)}
                    >
                      <FieldsPanel />
                    </Panel>
                  </Group>
                </Panel>
                <Separator className="w-1.5" />
                <Panel minSize="30">
                  <div className="island-editor h-full">
                    <EditorArea />
                  </div>
                </Panel>
                <Separator className="w-1.5" style={{ display: rightTool ? undefined : "none" }} />
                <Panel
                  panelRef={queriesPanel}
                  collapsible
                  collapsedSize={0}
                  defaultSize={0}
                  minSize="12"
                  maxSize="40"
                  onResize={(size) => useApp.getState().rightTool && size.asPercentage > 1 && setQueriesSize(size.asPercentage)}
                >
                  {/* one dock, whichever tool window the stripe asked for */}
                  {rightTool === "notifications" ? <NotificationCenter /> : <SavedQueries />}
                </Panel>
              </Group>
            </div>
          </Panel>
          <Separator className="h-1.5" style={{ display: bottomOpen ? undefined : "none" }} />
          {/* collapsed rather than unmounted: the height you dragged it to survives hiding it,
              and so do the terminals, which would otherwise be torn down and started again */}
          <Panel panelRef={terminalPanel} collapsible collapsedSize={0} defaultSize={0} minSize="10" maxSize="80" onResize={onTerminalResize}>
            <div className="h-full" style={{ display: showEndpoints ? "none" : undefined }}>
              <TerminalPanel />
            </div>
            {showEndpoints && <EndpointsPanel />}
          </Panel>
        </Group>
        <RightStripe />
      </div>
      <StatusBar />
      <About />
      <UpdateNotes />
      <Notifications />
      <Tooltips />
      <NameQuery />
      <Island />
      <HelpWindow />
      <TraceDialog />
      {/* the tour again, over the IDE, from Help or Find Action */}
      {showTour && (
        <div className="fixed inset-0 z-[100]">
          <Onboarding onDone={() => useApp.getState().setShowTour(false)} />
        </div>
      )}
      <ReplayWindow />
      <LocatedWindow />
      <ServiceMapWindow />
      <InvestigationWindow />
      <CompareWindow />
      {showSearch && <SearchEverywhere />}
      {showSettings && <SettingsDialog />}
      {askQuit && <QuitPrompt remember={remember} setRemember={setRemember} onDone={() => setAskQuit(false)} />}
    </div>
  );
}

/**
 * Asked once, and then only as often as you want: the remembered answer becomes the
 * terminal's on-quit preference, which the settings window can change back.
 */
function QuitPrompt({ remember, setRemember, onDone }: { remember: boolean; setRemember: (v: boolean) => void; onDone: () => void }) {
  const { terminals, settings, setSettings, killAllTerminals } = useApp();
  const answer = async (kill: boolean) => {
    if (remember) await setSettings({ ...settings, terminal: { ...settings.terminal, onQuit: kill ? "kill" : "leave" } });
    if (kill) await killAllTerminals();
    onDone();
    await getCurrentWindow().destroy();
  };
  const run = (kill: boolean) => void answer(kill).catch((e: unknown) => console.error("could not close the window", e));
  return (
    <ConfirmDialog
      title={`Close ${terminals.length} terminal ${terminals.length === 1 ? "session" : "sessions"}?`}
      message="Left running, they keep working in tmux and come back the next time you open Flux."
      confirmLabel="Close them"
      cancelLabel="Leave them running"
      danger={false}
      extra={<Checkbox checked={remember} onChange={setRemember} label="Do not ask again" />}
      onConfirm={() => run(true)}
      onCancel={() => run(false)}
      onDismiss={onDone}
    />
  );
}
