import { useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { DatabaseExplorer } from "@/components/DatabaseExplorer";
import { EditorArea } from "@/components/EditorArea";
import { SearchEverywhere } from "@/components/SearchEverywhere";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { LeftStripe, RightStripe, StatusBar, TitleBar } from "@/components/Shell";
import { useApp } from "@/store";

export default function App() {
  const { init, ready, showSettings, showSearch, activeTab, runQuery, settings } = useApp();

  useEffect(() => {
    void init();
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
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && activeTab) {
        e.preventDefault();
        void runQuery(activeTab);
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
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        useApp.getState().setShowSearch(true, "endpoints");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, runQuery]);

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
        <Group orientation="horizontal" className="min-h-0 flex-1">
          <Panel defaultSize="26" minSize="14" maxSize="50">
            <div className="island h-full">
              <DatabaseExplorer />
            </div>
          </Panel>
          <Separator className="w-1.5" />
          <Panel minSize="30">
            <div className="island-editor h-full">
              <EditorArea />
            </div>
          </Panel>
        </Group>
        <RightStripe />
      </div>
      <StatusBar />
      {showSearch && <SearchEverywhere />}
      {showSettings && <SettingsDialog />}
    </div>
  );
}
