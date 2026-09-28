import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Bookmark,
  Bug,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderX,
  GitBranch,
  Keyboard,
  MoreVertical,
  Palette,
  PanelRight,
  Plug,
  RefreshCw,
  Search,
  Server,
  Settings2,
  SquareTerminal,
  Tags,
  Unplug,
  Wrench,
} from "lucide-react";
import { Logo } from "./Logo";
import { McpIcon } from "./icons";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { useApp } from "@/store";
import { taskLabel, visibleTask, worstOf } from "@/lib/progress";
import { shortPath, workspaceName } from "@/lib/workspaces";
import { clientConfig } from "@/lib/mcp";
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
    { label: "Open…", icon: <FolderOpen size={12} />, onClick: () => void choose() },
    ...(workspaceFolder
      ? ([
          { separator: true },
          { label: "Current Workspace", disabled: true },
          { label: workspaceName(workspaceFolder), shortcut: shortPath(workspaceFolder, home), disabled: true },
          { label: "Close Workspace", icon: <FolderX size={12} />, onClick: () => void closeWorkspace() },
        ] as MenuItem[])
      : []),
    ...(recentWorkspaces.filter((r) => r.folder !== workspaceFolder).length
      ? ([{ separator: true }, { label: "Recent Workspaces", disabled: true }] as MenuItem[])
      : []),
    ...recentWorkspaces
      .filter((r) => r.folder !== workspaceFolder)
      .map((r) => ({
        label: workspaceName(r.folder),
        icon: <Folder size={12} />,
        shortcut: shortPath(r.folder, home),
        onClick: () => void openWorkspace(r.folder),
      })),
  ];

  // Flux keeps no connection open, so these are about what the window knows: re-read what is
  // on screen, forget it, or forget it and fetch it again.
  const connectionItems: MenuItem[] = [
    { label: "Reconnect all connections", icon: <Plug size={12} />, onClick: () => void reconnectAll() },
    { label: "Disconnect all connections", icon: <Unplug size={12} />, onClick: () => disconnectAll() },
    { separator: true },
    { label: "Refresh all connections", icon: <RefreshCw size={12} />, onClick: () => void refreshAll() },
  ];

  // each row opens the settings page it names; the theme lives on the appearance page
  const items: MenuItem[] = [
    { label: "Theme", icon: <Palette size={12} />, onClick: () => setShowSettings(true, "appearance") },
    { label: "Keymap", icon: <Keyboard size={12} />, onClick: () => setShowSettings(true, "keymap") },
    { separator: true },
    { label: "Settings…", icon: <Settings2 size={12} />, shortcut: "⌘,", onClick: () => setShowSettings(true) },
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
  const { showTerminal, toggleTerminal, showFields, toggleFields } = useApp();
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-1 py-1.5">
      <StripeButton active tip="Connection Explorer">
        <Server size={16} />
      </StripeButton>
      <StripeButton tip="Fields" active={showFields} onClick={toggleFields}>
        <Tags size={16} />
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
  const { tabs, activeTab, patchTab, rightTool, toggleRightTool, noticeLog } = useApp();
  const tab = tabs.find((t) => t.id === activeTab);
  const rows = !!tab?.page?.rows.length;
  const waiting = worstOf(noticeLog);
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-1 py-1.5">
      <StripeButton
        tip={waiting ? `Notifications — ${noticeLog.length} kept` : "Notifications"}
        active={rightTool === "notifications"}
        dot={waiting ? (waiting === "error" ? "var(--red)" : waiting === "warning" ? "var(--amber)" : "var(--cyan)") : undefined}
        onClick={() => toggleRightTool("notifications")}
      >
        <Bell size={16} />
      </StripeButton>
      <StripeButton
        // there is nothing to inspect until a query has returned a row
        tip={rows ? "Value inspector" : "Value inspector — run a query first"}
        disabled={!rows}
        active={tab?.selectedRow != null}
        onClick={() => tab && patchTab(tab.id, { selectedRow: tab.selectedRow == null ? 0 : undefined })}
      >
        <PanelRight size={16} />
      </StripeButton>
      <StripeButton tip="Saved Queries" active={rightTool === "queries"} onClick={() => toggleRightTool("queries")}>
        <Bookmark size={16} />
      </StripeButton>
    </div>
  );
}

function StripeButton({
  children,
  active,
  tip,
  tipKey,
  disabled,
  dot,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  tip?: string;
  tipKey?: string;
  /** A tool window with nothing to show says so by not being pressable. */
  disabled?: boolean;
  /** A tool window with something waiting says so with a mark in this colour. */
  dot?: string;
  onClick?: () => void;
}) {
  return (
    <button
      data-tip={tip}
      data-tip-key={tipKey}
      disabled={disabled}
      onClick={onClick}
      className="relative flex size-7 items-center justify-center rounded-md disabled:opacity-35"
      style={{ background: active ? "var(--stripe-active)" : undefined, color: "var(--text-dim)" }}
      onMouseEnter={(e) => {
        if (!active && !disabled) e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "";
      }}
    >
      {children}
      {dot && (
        <span
          className="absolute translate-x-[9px] translate-y-[-9px] rounded-full"
          style={{ width: 6, height: 6, background: dot, border: "1px solid var(--bg-window)" }}
        />
      )}
    </button>
  );
}

export function StatusBar() {
  const { tabs, activeTab, settings, settingsError, update, setShowUpdateNotes } = useApp();
  const [mcpOpen, setMcpOpen] = useState(false);
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
        <span className="relative">
          <button
            onClick={() => setMcpOpen((v) => !v)}
            data-tip={settings.mcp.enabled ? "MCP server is running" : "MCP server is off"}
            className="flex size-[22px] items-center justify-center rounded hover:bg-[var(--bg-hover)]"
            style={{ color: settings.mcp.enabled ? "var(--green)" : "var(--text-muted)" }}
          >
            <McpIcon size={16} />
          </button>
          {mcpOpen && <McpPopover onClose={() => setMcpOpen(false)} />}
        </span>
      </span>
    </div>
  );
}

/**
 * The same handful of settings the IDE keeps behind its status bar icon: on or off, where it
 * is, and the configuration to paste into a client. The rest is a click away in Settings.
 */
function McpPopover({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, setShowSettings } = useApp();
  const m = settings.mcp;
  const { url, json, cli } = clientConfig(m.port, m.token);
  const [copied, setCopied] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const enable = (on: boolean) => void setSettings({ ...settings, mcp: { ...m, enabled: on, token: m.token || crypto.randomUUID() } });

  const copy = (what: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(""), 1400);
    });
  };

  const button = "h-[22px] rounded-[4px] px-2 text-[11px]";
  const outline = { background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" };

  return (
    <div
      ref={ref}
      className="absolute right-0 bottom-[26px] z-[70] w-[320px] rounded-[10px] p-3"
      style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 18px 48px rgba(0,0,0,.55)" }}
    >
      <div className="flex items-center">
        <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
          MCP Server
        </span>
        <button
          onClick={() => {
            onClose();
            setShowSettings(true, "mcp");
          }}
          data-tip="MCP settings"
          className="ml-auto flex size-5 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-dim)" }}
        >
          <Settings2 size={12} />
        </button>
      </div>

      <label className="mt-2 flex cursor-default items-center gap-2 text-[12px]" style={{ color: "var(--text)" }}>
        <input type="checkbox" checked={m.enabled} onChange={(e) => enable(e.target.checked)} />
        Enable MCP Server
      </label>

      <p className="mt-2 font-[var(--font-mono)] text-[11px]" style={{ color: m.enabled ? "var(--accent)" : "var(--text-muted)" }}>
        {url}
      </p>

      <p className="mt-3 text-[11px]" style={{ color: "var(--text-dim)" }}>
        Manual client configuration
      </p>
      <div className="mt-1.5 flex gap-2">
        <button className={button} style={outline} disabled={!m.token} onClick={() => copy("json", json)}>
          {copied === "json" ? "Copied" : "Copy JSON"}
        </button>
        <button className={button} style={outline} disabled={!m.token} onClick={() => copy("cli", cli)}>
          {copied === "cli" ? "Copied" : "Copy command"}
        </button>
      </div>

      <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Read-only: connections, streams, searches and endpoints. Tokens are never part of an answer.
      </p>
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
