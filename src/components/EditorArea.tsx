import { useEffect, useRef, useState } from "react";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import { MoreVertical, X } from "lucide-react";
import { QueryConsole } from "./QueryConsole";
import { GroupTables } from "./GroupTables";
import { Timeline } from "./Timeline";
import { ResultGrid } from "./ResultGrid";
import { ValueInspector } from "./ValueInspector";
import { EndpointIcon, StreamIcon } from "./icons";
import { Logo } from "./Logo";
import { unsaved } from "@/lib/queries";
import { useApp, type Tab } from "@/store";

export function EditorArea() {
  const { tabs, activeTab } = useApp();
  const tab = tabs.find((t) => t.id === activeTab);

  return (
    <div className="flex h-full flex-col">
      <TabStrip />
      {tab ? <TabBody tab={tab} /> : <Welcome />}
    </div>
  );
}

function TabStrip() {
  const { tabs, activeTab, setActive, closeTab, moveTab, savedQueries } = useApp();
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const dragged = useRef(false);

  /**
   * Moving a tab, on plain mouse events: this webview swallows HTML5 drag, and the tab
   * should follow the pointer from the first few pixels rather than when the browser decides
   * a drag has begun. Under the threshold it stays a click, which selects the tab.
   */
  const startDrag = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault(); // otherwise the press begins selecting the tab's own title
    const from = e.clientX;
    dragged.current = false;
    let over: string | null = null;

    const move = (ev: MouseEvent) => {
      if (!dragged.current && Math.abs(ev.clientX - from) < 4) return;
      dragged.current = true;
      // the tab follows the pointer; it is pointer-transparent while it does, so the tab
      // underneath is the one found here rather than the one being carried
      setDrag({ id, dx: ev.clientX - from });
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-tab]");
      const name = under instanceof HTMLElement ? (under.dataset.tab ?? null) : null;
      over = name && name !== id ? name : null;
      setDropOn(over);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (dragged.current && over) moveTab(id, over);
      setDrag(null);
      setDropOn(null);
      setTimeout(() => (dragged.current = false), 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (!tabs.length) return <div className="h-[45px] shrink-0" />;
  return (
    <div className="flex h-[45px] shrink-0 items-start gap-1 overflow-x-auto overflow-y-hidden px-1.5 pt-1.5">
      {tabs.map((t) => {
        const active = t.id === activeTab;
        return (
          <div
            key={t.id}
            data-tab={t.id}
            onMouseDown={(e) => startDrag(e, t.id)}
            onClick={() => setActive(t.id)}
            onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
            className="group flex h-[26px] max-w-[260px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px]"
            style={{
              background: active ? "var(--bg-raised)" : "transparent",
              color: active ? "var(--text)" : "var(--text-dim)",
              boxShadow: dropOn === t.id ? "inset 2px 0 0 var(--accent)" : undefined,
              cursor: drag ? "grabbing" : "default",
              userSelect: "none",
              ...(drag?.id === t.id
                ? { transform: `translateX(${drag.dx}px)`, zIndex: 10, pointerEvents: "none" as const, opacity: 0.85 }
                : { transition: "transform 120ms ease" }),
            }}
            data-tip={`${t.streamLabel} · ${t.title}`}
          >
            <span className="flex size-3.5 shrink-0 items-center justify-center">{t.endpoint ? <EndpointIcon /> : <StreamIcon />}</span>
            <span className="truncate font-[var(--font-mono)]">{t.title}</span>
            {unsaved(t, savedQueries) && (
              <span className="size-[5px] shrink-0 rounded-full" style={{ background: "var(--accent)" }} data-tip="Edited since it was saved" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              data-tip="Close tab"
              data-tip-key="⌘W"
              className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)]"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
      <button className="ml-auto flex size-6 shrink-0 items-center justify-center rounded hover:bg-[var(--bg-hover)]">
        <MoreVertical size={13} style={{ color: "var(--text-dim)" }} />
      </button>
    </div>
  );
}

function TabBody({ tab }: { tab: Tab }) {
  const { inspectorSize, setInspectorSize } = useApp();
  const showInspector = tab.selectedRow != null && !!tab.page;
  const inspector = useRef<PanelImperativeHandle>(null);

  // collapsed rather than unmounted, so the width you dragged it to survives closing it.
  // A bare number is pixels to this library, which is how the terminal panel once opened
  // flat against the bottom of the window.
  useEffect(() => {
    const panel = inspector.current;
    if (!panel) return;
    if (showInspector) {
      panel.expand();
      panel.resize(`${Math.min(70, Math.max(15, inspectorSize))}%`);
    } else {
      panel.collapse();
    }
    // inspectorSize is deliberately absent: dragging must not re-drive the panel it came from
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInspector]);

  return (
    <Group orientation="vertical" className="min-h-0 flex-1">
      <Panel defaultSize="28" minSize="12">
        <QueryConsole tab={tab} />
      </Panel>
      <Separator className="h-px" />
      <Panel minSize="25">
        <Group orientation="horizontal">
          <Panel minSize="30">
            <div className="flex h-full min-h-0 flex-col">
              <Timeline tab={tab} />
              <GroupTables tab={tab} />
              <div className="min-h-0 flex-1">
                <ResultGrid tab={tab} />
              </div>
            </div>
          </Panel>
          <Separator className="w-px" style={{ display: showInspector ? undefined : "none" }} />
          <Panel
            panelRef={inspector}
            collapsible
            collapsedSize={0}
            defaultSize={0}
            minSize="15"
            maxSize="70"
            onResize={(size) => showInspector && size.asPercentage > 1 && setInspectorSize(size.asPercentage)}
          >
            <ValueInspector tab={tab} />
          </Panel>
        </Group>
      </Panel>
    </Group>
  );
}

function Welcome() {
  const { setShowSettings, setShowSearch, settings } = useApp();
  const connected = settings.connections.length > 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <Logo size={56} />
      <h1 className="text-[22px] font-light" style={{ color: "var(--text)" }}>
        Welcome to Flux
      </h1>

      {connected ? (
        <div className="mt-2 flex flex-col gap-3">
          <Hint label="Search Everywhere" keys="⇧ ⇧" onClick={() => setShowSearch(true)} />
          <Hint label="Go to Endpoint" keys="⇧⌘O" onClick={() => setShowSearch(true, "endpoints")} />
          <Hint label="Execute Query" keys="⌘⏎" />
          <Hint label="Close Tab" keys="⌘W" />
          <Hint label="Settings" keys="⌘," onClick={() => setShowSettings(true)} />
        </div>
      ) : (
        <button
          onClick={() => setShowSettings(true, "connections")}
          className="mt-2 flex h-[76px] w-[140px] flex-col items-center justify-center gap-2 rounded-lg text-[12px]"
          style={{ background: "var(--bg-tool)", border: "1px solid var(--accent)", color: "var(--text-dim)" }}
        >
          <span style={{ color: "var(--accent)" }}>＋</span>
          Connection
        </button>
      )}
    </div>
  );
}

/** One line of the empty-editor hint list: action, then its keys, as in the IDE. */
function Hint({ label, keys, onClick }: { label: string; keys: string; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      className={`flex items-baseline gap-3 text-[15px] ${onClick ? "cursor-default" : ""}`}
      style={{ color: "var(--text-muted)" }}
    >
      <span className={onClick ? "hover:text-[var(--text-dim)]" : undefined}>{label}</span>
      <span className="text-[14px]" style={{ color: "var(--text-dim)" }}>
        {keys}
      </span>
    </span>
  );
}
