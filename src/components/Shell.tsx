import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Bug, ChevronDown, GitBranch, MoreHorizontal, MoreVertical, PanelRight, Search, Server, SquareTerminal, Wrench } from "lucide-react";
import { Logo } from "./Logo";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { useApp } from "@/store";
import { taskLabel, visibleTask } from "@/lib/progress";
import { shortPath, workspaceName } from "@/lib/workspaces";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";

/** macOS traffic lights are overlaid by Tauri, so the bar keeps 78px clear on the left. */
export function TitleBar() {
  const { setShowSettings, setShowSearch, refreshAll, disconnectAll, reconnectAll } = useApp();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [connections, setConnections] = useState<{ x: number; y: number } | null>(null);
  const [workspaces, setWorkspaces] = useState<{ x: number; y: number } | null>(null);
  const [home, setHome] = useState("");
  const { workspaceFolder, recentWorkspaces, openWorkspace, closeWorkspace } = useApp();

  useEffect(() => {
    void homeDir().then((h) => setHome(h.replace(/\/$/, "")));
  }, []);

  const choose = async () => {
    const picked = await pickFolder({ directory: true, multiple: false });
    if (typeof picked === "string") await openWorkspace(picked);
  };

  // the folder that is open, then the ones before it, as the IDE lists them
  const workspaceItems: MenuItem[] = [
    { label: "Open…", onClick: () => void choose() },
    ...(workspaceFolder
      ? ([
          { separator: true },
          { label: "Current Workspace", disabled: true },
          { label: workspaceName(workspaceFolder), shortcut: shortPath(workspaceFolder, home), disabled: true },
          { label: "Close Workspace", onClick: () => void closeWorkspace() },
        ] as MenuItem[])
      : []),
    ...(recentWorkspaces.filter((r) => r.folder !== workspaceFolder).length
      ? ([{ separator: true }, { label: "Recent Workspaces", disabled: true }] as MenuItem[])
      : []),
    ...recentWorkspaces
      .filter((r) => r.folder !== workspaceFolder)
      .map((r) => ({
        label: workspaceName(r.folder),
        shortcut: shortPath(r.folder, home),
        onClick: () => void openWorkspace(r.folder),
      })),
  ];

  // Flux keeps no connection open, so these are about what the window knows: re-read what is
  // on screen, forget it, or forget it and fetch it again.
  const connectionItems: MenuItem[] = [
    { label: "Reconnect all connections", onClick: () => void reconnectAll() },
    { label: "Disconnect all connections", onClick: () => disconnectAll() },
    { separator: true },
    { label: "Refresh all connections", onClick: () => void refreshAll() },
  ];

  // each row opens the settings page it names; the theme lives on the appearance page
  const items: MenuItem[] = [
    { label: "Theme", onClick: () => setShowSettings(true, "appearance") },
    { label: "Keymap", onClick: () => setShowSettings(true, "keymap") },
    { separator: true },
    { label: "Settings…", shortcut: "⌘,", onClick: () => setShowSettings(true) },
  ];

  const icon = "flex size-7 items-center justify-center rounded-md hover:bg-[var(--bg-hover)]";
  return (
    <div data-tauri-drag-region className="flex h-9 shrink-0 items-center gap-2 pr-1 pl-[78px]">
      <button
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-[var(--bg-hover)]"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setWorkspaces({ x: r.left, y: r.bottom + 4 });
        }}
      >
        <Logo size={18} radius={40} />
        <span className="text-[13px]">{workspaceFolder ? workspaceName(workspaceFolder) : "Flux"}</span>
        <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />
      </button>
      {workspaces && <ContextMenu x={workspaces.x} y={workspaces.y} items={workspaceItems} onClose={() => setWorkspaces(null)} />}
      <button
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] hover:bg-[var(--bg-hover)]"
        style={{ color: "var(--text-dim)" }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setConnections({ x: r.left, y: r.bottom + 4 });
        }}
      >
        Connections
        <ChevronDown size={12} />
      </button>
      {connections && <ContextMenu x={connections.x} y={connections.y} items={connectionItems} onClose={() => setConnections(null)} />}
      <div className="ml-auto flex items-center gap-0.5">
        <button className={icon} data-tip="Settings" data-tip-key="⌘," onClick={() => setShowSettings(true)}>
          <Wrench size={15} style={{ color: "var(--text-dim)" }} />
        </button>
        <button className={icon}>
          <Bug size={15} style={{ color: "var(--text-dim)" }} />
        </button>
        <button className={icon} data-tip="Search Everywhere" data-tip-key="⇧⇧" onClick={() => setShowSearch(true)}>
          <Search size={15} style={{ color: "var(--text-dim)" }} />
        </button>
        <button
          className={icon}
          data-tip="More"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.right - 220, y: r.bottom + 4 });
          }}
        >
          <MoreVertical size={15} style={{ color: "var(--text-dim)" }} />
        </button>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
      </div>
    </div>
  );
}

export function LeftStripe() {
  const { showTerminal, toggleTerminal } = useApp();
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-1 py-1.5">
      <StripeButton active tip="Connection Explorer">
        <Server size={16} />
      </StripeButton>
      <StripeButton tip="More tool windows">
        <MoreHorizontal size={16} />
      </StripeButton>
      <div className="flex-1" />
      <StripeButton tip="Terminal" tipKey="⌥F12" active={showTerminal} onClick={toggleTerminal}>
        <SquareTerminal size={16} />
      </StripeButton>
      <StripeButton tip="Version control">
        <GitBranch size={16} />
      </StripeButton>
    </div>
  );
}

export function RightStripe() {
  const { tabs, activeTab, patchTab } = useApp();
  const tab = tabs.find((t) => t.id === activeTab);
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-1 py-1.5">
      <StripeButton
        tip="Value inspector"
        active={!!tab?.selectedRow || tab?.selectedRow === 0}
        onClick={() => tab && patchTab(tab.id, { selectedRow: tab.selectedRow == null ? 0 : undefined })}
      >
        <PanelRight size={16} />
      </StripeButton>
    </div>
  );
}

function StripeButton({
  children,
  active,
  tip,
  tipKey,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  tip?: string;
  tipKey?: string;
  onClick?: () => void;
}) {
  return (
    <button
      data-tip={tip}
      data-tip-key={tipKey}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md"
      style={{ background: active ? "var(--stripe-active)" : undefined, color: "var(--text-dim)" }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "";
      }}
    >
      {children}
    </button>
  );
}

export function StatusBar() {
  const { tabs, activeTab, settings, settingsError, update, setShowUpdateNotes } = useApp();
  const version = useAppVersion();
  const tab = tabs.find((t) => t.id === activeTab);
  const conn = settings.connections.find((c) => c.id === tab?.connId);
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 px-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
      {settingsError && (
        <span className="truncate" style={{ color: "var(--red)" }} title={settingsError}>
          {settingsError}
        </span>
      )}
      {tab ? (
        <>
          <span className="flex items-center gap-1.5">
            <Server size={11} />
            {conn?.name ?? "—"}
          </span>
          <span className="truncate">{tab.streamLabel}</span>
          {tab.error ? (
            <span style={{ color: "var(--red)" }} className="truncate">
              {tab.error}
            </span>
          ) : tab.page ? (
            <span>
              {tab.page.rows.length} rows · {tab.took} ms
            </span>
          ) : null}
        </>
      ) : (
        <span>Ready</span>
      )}
      <span className="ml-auto flex items-center gap-3">
        <BackgroundTask />
        <span>{settings.connections.length} connections</span>
        {update && (
          <button
            onClick={() => setShowUpdateNotes(true)}
            data-tip={`Flux ${update.version} is ready to install`}
            className="rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--accent)" }}
          >
            Update available
          </button>
        )}
        {version && <span data-tip="Flux version">v{version}</span>}
      </span>
    </div>
  );
}

/**
 * What the window is doing right now: the newest job, how far along it is when it knows, and
 * a stop button only when there is something to stop.
 */
function BackgroundTask() {
  const { tasks } = useApp();
  const task = visibleTask(tasks);
  if (!task) return null;
  const pct = task.progress === undefined ? undefined : Math.round(Math.min(1, Math.max(0, task.progress)) * 100);
  return (
    <span className="flex items-center gap-2">
      <span className="max-w-[240px] truncate">{taskLabel(tasks)}</span>
      <span className="relative h-1 w-[110px] overflow-hidden rounded-full" style={{ background: "var(--bg-raised)" }}>
        <span
          className={pct === undefined ? "progress-drift absolute inset-y-0 w-1/3 rounded-full" : "absolute inset-y-0 left-0 rounded-full"}
          style={{ background: "var(--accent)", width: pct === undefined ? undefined : `${pct}%` }}
        />
      </span>
      {task.cancel && (
        <button onClick={task.cancel} data-tip="Stop" className="flex size-4 items-center justify-center rounded-[3px] hover:bg-[var(--bg-hover)]">
          <span className="size-[9px] rounded-[2px]" style={{ border: "1.5px solid var(--red)" }} />
        </button>
      )}
    </span>
  );
}

/** The version baked into the bundle, which `make bump-*` keeps in step with the git tag. */
function useAppVersion(): string {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);
  return version;
}
