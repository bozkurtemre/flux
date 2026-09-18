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
import { NameQuery, SavedQueries } from "./components/SavedQueries";
import { TerminalPanel } from "@/components/TerminalPanel";
import { Notifications } from "@/components/Notifications";
import { About } from "@/components/About";
import { UpdateNotes } from "@/components/UpdateNotes";
import { Tooltips } from "@/components/Tooltip";
import { ConfirmDialog } from "@/components/ContextMenu";
import { Checkbox } from "@/components/settings/controls";
import { quitAction } from "@/lib/terminal";
import { runTool, TOOLS } from "@/lib/mcp";
import { failureReason } from "@/lib/progress";
import { clientFor } from "@/store";
import { useApp } from "@/store";

export default function App() {
  const { init, ready, showSettings, showSearch, activeTab, runQuery, settings, showTerminal, terminalSize, setTerminalSize, showQueries } = useApp();
  const terminalPanel = useRef<PanelImperativeHandle>(null);
  const queriesPanel = useRef<PanelImperativeHandle>(null);
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
      // the console has its own Mod-Enter; running it here as well would start the query twice
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && activeTab && !typing) {
        e.preventDefault();
        void runQuery(activeTab);
      }
      // Cmd+R re-runs the query rather than reloading the window, which is what the webview
      // would otherwise do with it.
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
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        useApp.getState().setShowSearch(true, "endpoints");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, runQuery]);

  // the panel answers the stripe button, at the height it was left at
  useEffect(() => {
    const panel = terminalPanel.current;
    if (!panel) return;
    if (showTerminal) {
      panel.expand();
      // a bare number is pixels to this library, and 32 pixels is below the minimum, which
      // collapsed the panel again the moment it was asked to open
      panel.resize(`${Math.min(80, Math.max(10, terminalSize))}%`);
    } else {
      panel.collapse();
    }
    // terminalSize is deliberately absent: dragging must not re-drive the panel it came from
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTerminal]);

  // the right tool window answers its stripe button the way the terminal answers its own
  useEffect(() => {
    const panel = queriesPanel.current;
    if (!panel) return;
    if (showQueries) {
      panel.expand();
      panel.resize("18%");
    } else {
      panel.collapse();
    }
  }, [showQueries]);

  const onTerminalResize = (size: { asPercentage: number }) => {
    if (useApp.getState().showTerminal && size.asPercentage > 1) setTerminalSize(size.asPercentage);
  };

  // Once an hour, without saying anything unless it finds something. A log explorer left
  // open for a day should not have to be restarted to learn there is a new version.
  useEffect(() => {
    if (!settings.updates.checkOnStartup) return;
    const hourly = setInterval(() => void useApp.getState().checkForUpdates(false), 60 * 60 * 1000);
    return () => clearInterval(hourly);
  }, [settings.updates.checkOnStartup]);

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
      }).catch((e: unknown) => ({
        content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
        isError: true,
      }));
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
      const action = quitAction(settings.terminal.onQuit, terminals.length, settings.terminal.useTmux && !tmuxMissing);
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
            <Group orientation="horizontal" className="h-full min-h-0">
              <Panel defaultSize="26" minSize="14" maxSize="50">
                <div className="island h-full">
                  <ConnectionExplorer />
                </div>
              </Panel>
              <Separator className="w-1.5" />
              <Panel minSize="30">
                <div className="island-editor h-full">
                  <EditorArea />
                </div>
              </Panel>
              <Separator className="w-1.5" style={{ display: showQueries ? undefined : "none" }} />
              <Panel panelRef={queriesPanel} collapsible collapsedSize={0} defaultSize={0} minSize="12" maxSize="40">
                <SavedQueries />
              </Panel>
            </Group>
          </Panel>
          <Separator className="h-1.5" style={{ display: showTerminal ? undefined : "none" }} />
          {/* collapsed rather than unmounted: the height you dragged it to survives hiding it,
              and so do the terminals, which would otherwise be torn down and started again */}
          <Panel panelRef={terminalPanel} collapsible collapsedSize={0} defaultSize={0} minSize="10" maxSize="80" onResize={onTerminalResize}>
            <TerminalPanel />
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
