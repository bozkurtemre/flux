import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronRight,
  ClipboardCopy,
  CopyPlus,
  Filter,
  FoldVertical,
  Plus,
  RefreshCw,
  SearchCode,
  Settings2,
  SquareTerminal,
  Terminal,
  Trash2,
} from "lucide-react";
import { Chevron, ConnectionIcon, EndpointIcon, ProjectIcon, Spinner, StreamIcon } from "./icons";
import { ConfirmDialog, ContextMenu, type MenuItem } from "./ContextMenu";
import { useApp, visibleRows, type TreeNode } from "@/store";

export function ConnectionExplorer() {
  const state = useApp();
  const rows = visibleRows(state);
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; run: () => void } | null>(null);
  const ROW = state.settings.tree.rowHeight;
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW,
    overscan: 20,
  });

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg-tool)" }}>
      <PanelHeader />
      <PanelToolbar />
      <FilterBox />
      <div ref={parentRef} className="flex-1 overflow-auto">
        {state.settings.connections.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ height: v.getTotalSize(), position: "relative" }}>
            {v.getVirtualItems().map((item) => (
              <div
                key={rows[item.index].id}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: ROW, transform: `translateY(${item.start}px)` }}
              >
                <Row node={rows[item.index]} onMenu={(x, y, node) => setMenu({ x, y, node })} />
              </div>
            ))}
          </div>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuFor(menu.node, (c) => setConfirm(c))} onClose={() => setMenu(null)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/** Right-click actions, mirroring the data-source menu in the IDE. */
function menuFor(node: TreeNode, ask: (c: { title: string; message: string; run: () => void }) => void): MenuItem[] {
  const app = useApp.getState();
  // one icon per kind of action, so a menu is read by its shapes before its words
  const console_ = <SquareTerminal size={12} />;
  const refresh = <RefreshCw size={12} />;
  const clip = <ClipboardCopy size={12} />;
  const conn = app.settings.connections.find((c) => c.id === node.connId);
  const copy = (t: string) => void navigator.clipboard.writeText(t).catch(() => {});
  const openIt = () => (node.kind === "endpoint" || node.kind === "stream" ? app.openTab(node) : void app.toggle(node.id));

  if (node.kind === "connection") {
    return [
      { label: "New Query Console", icon: console_, disabled: true },
      { label: "Refresh", icon: refresh, shortcut: "⌘R", onClick: () => void app.refresh(node.id) },
      { separator: true },
      { label: "Properties…", icon: <Settings2 size={12} />, shortcut: "F4", onClick: () => app.setShowSettings(true, "connections", node.connId) },
      {
        label: "Duplicate",
        icon: <CopyPlus size={12} />,
        onClick: () => {
          if (!conn) return;
          const copyConn = { ...conn, id: crypto.randomUUID(), name: `${conn.name} copy` };
          void app.setSettings({ ...app.settings, connections: [...app.settings.connections, copyConn] });
        },
      },
      { separator: true },
      { label: "Copy Name", icon: clip, onClick: () => copy(node.label) },
      { label: "Copy URL", icon: clip, onClick: () => copy(conn?.graylogUrl ?? "") },
      { separator: true },
      {
        label: "Delete…",
        icon: <Trash2 size={12} />,
        shortcut: "⌫",
        danger: true,
        onClick: () =>
          ask({
            title: `Delete connection “${node.label}”?`,
            message: "Flux forgets its URL and token. Graylog itself is not touched.",
            run: () => void app.setSettings({ ...app.settings, connections: app.settings.connections.filter((c) => c.id !== node.connId) }),
          }),
      },
    ];
  }

  if (node.kind === "project") {
    const project = app.settings.projects.find((p) => p.id === node.projectId);
    return [
      { label: "Expand", icon: <ChevronRight size={12} />, onClick: () => void app.toggle(node.id) },
      { label: "Refresh", shortcut: "⌘R", onClick: () => void app.refresh(node.id) },
      { separator: true },
      {
        label: "Open Terminal",
        icon: <Terminal size={12} />,
        disabled: !project,
        onClick: () => project && app.openTerminal(project.id, project.name),
      },
      { separator: true },
      { label: "Copy Name", onClick: () => copy(node.label) },
      { label: "Copy GitHub Repository", icon: clip, disabled: !node.sub, onClick: () => copy(node.sub ?? "") },
    ];
  }

  if (node.kind === "stream") {
    return [
      { label: "Open Query Console", icon: console_, shortcut: "↵", onClick: openIt },
      { label: "Refresh Endpoints", icon: refresh, shortcut: "⌘R", onClick: () => void app.refresh(node.id) },
      { separator: true },
      { label: "Copy Stream Name", icon: clip, onClick: () => copy(node.label) },
      { label: "Copy Stream ID", icon: clip, onClick: () => copy(node.streamId ?? "") },
      { label: "Copy Graylog URL", icon: clip, onClick: () => copy(`${conn?.graylogUrl ?? ""}/streams/${node.streamId}/search`) },
    ];
  }

  return [
    { label: "Open Query Console", shortcut: "↵", onClick: openIt },
    { separator: true },
    { label: "Copy Path", icon: clip, onClick: () => copy(node.label) },
    { label: "Copy as Lucene Filter", icon: clip, onClick: () => copy(`route:"${node.label}"`) },
    { label: "Copy Method and Path", icon: clip, onClick: () => copy(`${node.endpoint?.method ?? ""} ${node.label}`.trim()) },
  ];
}

/** A title row over a toolbar row, both inside the island. */
function PanelHeader() {
  return (
    <div className="flex h-[28px] shrink-0 items-center px-3">
      <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
        Connection Explorer
      </span>
    </div>
  );
}

function PanelToolbar() {
  const { refresh, selectedNode, setShowSettings, nodes, expanded } = useApp();
  const btn = "flex size-[22px] items-center justify-center rounded";
  const style = { color: "var(--text-dim)" } as const;
  const hover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = "var(--bg-hover)"),
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = ""),
  };
  return (
    <div className="flex h-[26px] shrink-0 items-center gap-0.5 px-2">
      <button className={btn} {...hover} data-tip="New connection" onClick={() => setShowSettings(true)}>
        <Plus size={15} style={{ color: "var(--accent)" }} />
      </button>
      <button
        className={btn}
        {...hover}
        data-tip="Find in tree"
        onClick={() => document.querySelector<HTMLInputElement>("#explorer-filter")?.focus()}
      >
        <SearchCode size={14} style={style} />
      </button>
      <span className="mx-1 h-3.5 w-px" style={{ background: "var(--border)" }} />
      <button className={btn} {...hover} data-tip="Refresh" onClick={() => selectedNode && nodes[selectedNode] && refresh(selectedNode)}>
        <RefreshCw size={13} style={style} />
      </button>
      <button className={btn} {...hover} data-tip="Collapse all" onClick={() => useApp.setState({ expanded: {} })}>
        <FoldVertical size={14} style={style} />
      </button>
      <span className="mx-1 h-3.5 w-px" style={{ background: "var(--border)" }} />
      <button
        className={btn}
        {...hover}
        data-tip="New query console"
        onClick={() => selectedNode && nodes[selectedNode]?.kind === "stream" && useApp.getState().openTab(nodes[selectedNode])}
      >
        <SquareTerminal size={14} style={style} />
      </button>
      <button className={btn} {...hover} data-tip="Settings" data-tip-key="⌘," onClick={() => setShowSettings(true)}>
        <Settings2 size={14} style={style} />
      </button>
      <span className="ml-auto pr-1 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
        {Object.values(expanded).filter(Boolean).length ? "" : ""}
      </span>
    </div>
  );
}

function FilterBox() {
  const { filter, setFilter } = useApp();
  return (
    <div className="mx-2 mb-1 flex h-[24px] shrink-0 items-center gap-1.5 rounded px-2" style={{ background: "var(--bg-input)" }}>
      <Filter size={11} style={{ color: "var(--text-muted)" }} />
      <input
        id="explorer-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter…"
        spellCheck={false}
        className="selectable h-full w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
        style={{ color: "var(--text)" }}
      />
    </div>
  );
}

function EmptyState() {
  const { setShowSettings } = useApp();
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <ConnectionIcon />
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        No connections yet
      </p>
      <button
        onClick={() => setShowSettings(true)}
        className="rounded px-2 py-1 text-[12px]"
        style={{ background: "var(--accent)", color: "var(--accent-text)" }}
      >
        Add a Graylog connection
      </button>
    </div>
  );
}

function Row({ node, onMenu }: { node: TreeNode; onMenu: (x: number, y: number, node: TreeNode) => void }) {
  const { expanded, loading, selectedNode, select, toggle, openTab, settings } = useApp();
  const t = settings.tree;
  const open = !!expanded[node.id];
  const busy = !!loading[node.id];
  const selected = selectedNode === node.id;
  const expandable = node.kind !== "endpoint";

  const tone =
    node.endpoint && t.colorByHealth ? (node.endpoint.errorRatePct >= 5 ? "bad" : node.endpoint.errorRatePct >= 1 ? "warn" : "ok") : undefined;

  return (
    <div
      onClick={() => {
        select(node.id);
        if (node.kind === "endpoint" || node.kind === "stream") openTab(node);
      }}
      onDoubleClick={() => expandable && toggle(node.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        select(node.id);
        onMenu(e.clientX, e.clientY, node);
      }}
      className="group flex h-full w-full items-center gap-1.5 pr-2 text-[13px]"
      style={{
        paddingLeft: 4 + node.depth * t.indent,
        background: selected ? "var(--sel-focus)" : undefined,
        color: selected ? "var(--text)" : undefined,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "";
      }}
      title={`${node.label}${node.sub ? ` · ${node.sub}` : ""}`}
    >
      <span
        className="flex size-4 shrink-0 items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          if (expandable) void toggle(node.id);
        }}
      >
        {busy ? <Spinner /> : expandable ? <Chevron open={open} /> : null}
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {node.kind === "connection" ? (
          <ConnectionIcon live={!!node.childrenIds && !node.error} failed={!!node.error} />
        ) : node.kind === "project" ? (
          <ProjectIcon />
        ) : node.kind === "stream" ? (
          <StreamIcon />
        ) : (
          <EndpointIcon tone={tone} />
        )}
      </span>
      {node.kind === "endpoint" && node.endpoint?.method && (
        <span className="shrink-0 font-[var(--font-mono)] text-[10px] font-semibold" style={{ color: "var(--text-muted)", width: 30 }}>
          {node.endpoint.method}
        </span>
      )}
      <span
        className="truncate"
        style={{ fontFamily: node.kind === "endpoint" ? "var(--font-mono)" : undefined, fontSize: node.kind === "endpoint" ? 12 : 13 }}
      >
        {node.label}
      </span>
      {node.kind === "endpoint" && node.endpoint && (t.showCounts || t.showErrorRate) ? (
        <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums" style={{ color: tone === "bad" ? "var(--red)" : "var(--text-muted)" }}>
          {t.showCounts ? compact(node.endpoint.requests) : ""}
          {t.showErrorRate && node.endpoint.errorRatePct >= 1 ? `${t.showCounts ? " · " : ""}${node.endpoint.errorRatePct.toFixed(1)}%` : ""}
        </span>
      ) : node.sub ? (
        <span className="ml-1 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
          {node.sub}
        </span>
      ) : null}
    </div>
  );
}

export function compact(n: number): string {
  return Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
