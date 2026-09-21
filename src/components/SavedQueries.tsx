// The right tool window: the queries this workspace has kept. Clicking one opens the console
// for the stream it was saved against and runs it there, rather than dropping its text into
// whichever console happens to be in front.
import { useMemo, useState } from "react";
import { Bell, BellOff, Check, ClipboardCopy, Clock, Filter, History, Pencil, SquareTerminal, Trash2 } from "lucide-react";
import { ConfirmDialog, ContextMenu, type MenuItem } from "./ContextMenu";
import { alarm, watchEvery } from "@/lib/queries";
import type { NoticeKind } from "@/lib/progress";
import { useApp } from "@/store";

/** The intervals worth a click; anything else is typed into Settings once. */
/** How loudly an alert arrives: the balloon's colour, a mark on the notification, a sound. */
const LEVELS: NoticeKind[] = ["info", "warning", "error"];

const INTERVALS = [
  { seconds: 15, label: "Every 15 seconds" },
  { seconds: 60, label: "Every minute" },
  { seconds: 300, label: "Every 5 minutes" },
  { seconds: 900, label: "Every 15 minutes" },
];

export function SavedQueries() {
  const [page, setPage] = useState<"saved" | "history">("saved");
  return (
    <div className="island flex h-full flex-col overflow-hidden">
      <div className="flex h-[26px] shrink-0 items-center gap-1 px-1.5" style={{ borderBottom: "1px solid var(--border-soft)" }}>
        {(["saved", "history"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className="h-[18px] rounded px-1.5 text-[11px] font-medium"
            style={{ background: page === p ? "var(--bg-active)" : undefined, color: page === p ? "var(--text)" : "var(--text-dim)" }}
          >
            {p === "saved" ? "Saved" : "History"}
          </button>
        ))}
      </div>
      {page === "saved" ? <SavedList /> : <HistoryList />}
    </div>
  );
}

/** Everything run in this window, newest first, whether it was worth saving or not. */
function HistoryList() {
  const { history, openHistory, clearHistory } = useApp();
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const shown = needle ? history.filter((h) => `${h.query} ${h.streamLabel}`.toLowerCase().includes(needle)) : history;

  if (!history.length) {
    return (
      <p className="p-3 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Nothing run yet. Every query you execute is kept here, and ⇧⇧ finds them too.
      </p>
    );
  }

  return (
    <>
      <div className="mx-2 mt-1 mb-1 flex h-[24px] shrink-0 items-center gap-1.5 rounded px-2" style={{ background: "var(--bg-input)" }}>
        <Filter size={11} style={{ color: "var(--text-muted)" }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          spellCheck={false}
          className="selectable h-full w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
          style={{ color: "var(--text)" }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-1">
        {shown.map((h) => (
          <div
            key={h.id}
            onClick={() => openHistory(h.id)}
            className="flex cursor-default flex-col gap-0.5 px-2 py-1.5"
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <span className="truncate font-[var(--font-mono)] text-[11px]" style={{ color: "var(--text)" }} title={h.query}>
              {h.query || "*"}
            </span>
            <span className="flex gap-2 truncate text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span className="truncate">{h.streamLabel}</span>
              <span className="ml-auto shrink-0 tabular-nums">{h.rows != null ? `${h.rows.toLocaleString()} rows` : ""}</span>
              <span className="shrink-0 tabular-nums">{new Date(h.at * 1000).toLocaleTimeString()}</span>
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={clearHistory}
        className="flex h-[24px] shrink-0 items-center gap-1.5 px-2 text-[11px] hover:bg-[var(--bg-hover)]"
        style={{ borderTop: "1px solid var(--border-soft)", color: "var(--text-dim)" }}
      >
        <History size={11} /> Clear history
      </button>
    </>
  );
}

/** `15s`, `1m`, `15m`: what the bell shows beside a watched query. */
function short(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function SavedList() {
  const {
    savedQueries,
    openSavedQuery,
    deleteSavedQuery,
    renameSavedQuery,
    toggleWatch,
    setWatchInterval,
    setWatchLevel,
    settings,
    tabs,
    activeTab,
  } = useApp();
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    id: string;
    name: string;
    query: string;
    watch?: boolean;
    every?: number;
    own?: number;
    level?: NoticeKind;
  } | null>(null);
  const [filter, setFilter] = useState("");
  const current = tabs.find((t) => t.id === activeTab)?.savedQueryId;
  const every = (q: { watch?: boolean; watchSeconds?: number }) => short(watchEvery(q, settings.advanced.watchSeconds));
  // the name is what you remember, the query is what you remember it by, and the stream is
  // which of the four "errors" you meant
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return savedQueries;
    return savedQueries.filter((q) => `${q.name} ${q.query} ${q.streamLabel}`.toLowerCase().includes(needle));
  }, [savedQueries, filter]);

  return (
    <>
      {savedQueries.length > 0 && (
        <div className="mx-2 mt-1 mb-1 flex h-[24px] shrink-0 items-center gap-1.5 rounded px-2" style={{ background: "var(--bg-input)" }}>
          <Filter size={11} style={{ color: "var(--text-muted)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            spellCheck={false}
            className="selectable h-full w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
            style={{ color: "var(--text)" }}
          />
        </div>
      )}

      {!savedQueries.length ? (
        <p className="p-3 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Nothing saved yet. Write a query and press ⌘S, or use the save button beside Execute.
        </p>
      ) : !shown.length ? (
        <p className="p-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Nothing matches “{filter.trim()}”
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto pb-1">
          {shown.map((q) => (
            <div
              key={q.id}
              onClick={() => openSavedQuery(q.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({
                  x: e.clientX,
                  y: e.clientY,
                  id: q.id,
                  name: q.name,
                  query: q.query,
                  watch: q.watch,
                  every: watchEvery(q, settings.advanced.watchSeconds),
                  own: q.watchSeconds,
                  level: q.level,
                });
              }}
              className="group flex cursor-default flex-col gap-0.5 px-2 py-1.5"
              style={{ background: current === q.id ? "var(--bg-active)" : undefined }}
              onMouseEnter={(e) => current !== q.id && (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => current !== q.id && (e.currentTarget.style.background = "")}
            >
              <div className="flex items-center gap-1.5">
                {q.watch && (
                  <span
                    className="flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums"
                    style={{ color: q.level === "error" ? "var(--red)" : q.level === "info" ? "var(--text-dim)" : "var(--amber)" }}
                    data-tip={`Looking every ${every(q)}`}
                  >
                    <Bell size={10} />
                    {every(q)}
                  </span>
                )}
                <span className="truncate text-[12px]" style={{ color: "var(--text)" }}>
                  {q.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirm({ id: q.id, name: q.name });
                  }}
                  data-tip="Delete"
                  className="ml-auto flex size-[18px] shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--text-dim)" }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
              <span className="truncate font-[var(--font-mono)] text-[11px]" style={{ color: "var(--text-muted)" }} title={q.query}>
                {q.query || "*"}
              </span>
              <span className="truncate text-[10px]" style={{ color: "var(--text-muted)" }}>
                {q.streamLabel}
              </span>
            </div>
          ))}
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            [
              { label: "Open", icon: <SquareTerminal size={12} />, onClick: () => openSavedQuery(menu.id) },
              { label: "Copy query", icon: <ClipboardCopy size={12} />, onClick: () => void navigator.clipboard.writeText(menu.query) },
              { label: "Rename…", icon: <Pencil size={12} />, onClick: () => setRenaming({ id: menu.id, name: menu.name }) },
              {
                label: menu.watch ? "Stop watching" : "Watch for new matches",
                icon: menu.watch ? <BellOff size={12} /> : <Bell size={12} />,
                onClick: () => toggleWatch(menu.id),
              },
              // how often this one looks, which is usually not how often the rest should
              ...(menu.watch
                ? [
                    { separator: true },
                    ...INTERVALS.map((i) => ({
                      label: i.label,
                      icon: menu.every === i.seconds ? <Check size={12} /> : <Clock size={12} style={{ opacity: 0.35 }} />,
                      onClick: () => setWatchInterval(menu.id, i.seconds),
                    })),
                    { separator: true },
                    ...LEVELS.map((l) => ({
                      label: `${alarm(l).mark}  Report as ${l}`,
                      icon: (menu.level ?? "warning") === l ? <Check size={12} /> : undefined,
                      onClick: () => setWatchLevel(menu.id, l),
                    })),
                    { separator: true },
                    {
                      label: `Use the default (${settings.advanced.watchSeconds}s)`,
                      icon: menu.own === undefined ? <Check size={12} /> : <Clock size={12} style={{ opacity: 0.35 }} />,
                      onClick: () => setWatchInterval(menu.id, undefined),
                    },
                  ]
                : []),
              { separator: true },
              { label: "Delete", icon: <Trash2 size={12} />, danger: true, onClick: () => setConfirm({ id: menu.id, name: menu.name }) },
            ] satisfies MenuItem[]
          }
          onClose={() => setMenu(null)}
        />
      )}

      {renaming && (
        <NameDialog
          title="Rename query"
          message="What it is called in this panel; the query itself is untouched."
          initial={renaming.name}
          confirmLabel="Rename"
          onConfirm={(name) => {
            renameSavedQuery(renaming.id, name);
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={`Delete “${confirm.name}”?`}
          message="The query is removed from this workspace. Consoles opened from it keep what they hold."
          onConfirm={() => {
            deleteSavedQuery(confirm.id);
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

/** The confirmation with a name in it, which saving and renaming both are. */
function NameDialog({
  title,
  message,
  initial,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  initial: string;
  confirmLabel: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <ConfirmDialog
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      danger={false}
      extra={
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="Name this query"
          spellCheck={false}
          className="selectable h-[26px] w-full rounded-[4px] px-2 text-[13px] outline-none"
          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      }
      onConfirm={() => onConfirm(name)}
      onCancel={onCancel}
    />
  );
}

/** Asked once, the first time a console's query is kept. */
export function NameQuery() {
  const { namingQuery, tabs, nameAndSaveQuery } = useApp();
  const tab = tabs.find((t) => t.id === namingQuery);
  if (!tab) return null;
  return (
    <NameDialog
      title="Save query"
      message={`It is kept with this workspace, on ${tab.streamLabel || "this stream"}.`}
      initial=""
      confirmLabel="Save"
      onConfirm={nameAndSaveQuery}
      onCancel={() => useApp.setState({ namingQuery: undefined })}
    />
  );
}
