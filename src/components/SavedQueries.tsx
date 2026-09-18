// The right tool window: the queries this workspace has kept. Clicking one opens the console
// for the stream it was saved against and runs it there, rather than dropping its text into
// whichever console happens to be in front.
import { useMemo, useState } from "react";
import { Filter, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "./ContextMenu";
import { useApp } from "@/store";

export function SavedQueries() {
  const { savedQueries, openSavedQuery, deleteSavedQuery, toggleQueries, tabs, activeTab } = useApp();
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState("");
  const current = tabs.find((t) => t.id === activeTab)?.savedQueryId;
  // the name is what you remember, the query is what you remember it by, and the stream is
  // which of the four "errors" you meant
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return savedQueries;
    return savedQueries.filter((q) => `${q.name} ${q.query} ${q.streamLabel}`.toLowerCase().includes(needle));
  }, [savedQueries, filter]);

  return (
    <div className="island flex h-full flex-col overflow-hidden">
      <div className="flex h-[26px] shrink-0 items-center gap-2 px-2" style={{ borderBottom: "1px solid var(--border-soft)" }}>
        <span className="text-[11px] font-medium" style={{ color: "var(--text-dim)" }}>
          Saved Queries
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
          {filter.trim() ? `${shown.length}/${savedQueries.length}` : savedQueries.length || ""}
        </span>
        <button
          onClick={toggleQueries}
          data-tip="Hide"
          className="ml-auto flex size-[18px] items-center justify-center rounded hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-dim)" }}
        >
          <X size={12} />
        </button>
      </div>

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
              className="group flex cursor-default flex-col gap-0.5 px-2 py-1.5"
              style={{ background: current === q.id ? "var(--bg-active)" : undefined }}
              onMouseEnter={(e) => current !== q.id && (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => current !== q.id && (e.currentTarget.style.background = "")}
            >
              <div className="flex items-center gap-1.5">
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
    </div>
  );
}

/** Asked once, the first time a console's query is kept. */
export function NameQuery() {
  const { namingQuery, tabs, nameAndSaveQuery } = useApp();
  const tab = tabs.find((t) => t.id === namingQuery);
  const [name, setName] = useState("");
  if (!tab) return null;

  return (
    <ConfirmDialog
      title="Save query"
      message={`It is kept with this workspace, on ${tab.streamLabel || "this stream"}.`}
      confirmLabel="Save"
      danger={false}
      extra={
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this query"
          spellCheck={false}
          className="selectable h-[26px] w-full rounded-[4px] px-2 text-[13px] outline-none"
          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      }
      onConfirm={() => nameAndSaveQuery(name)}
      onCancel={() => useApp.setState({ namingQuery: undefined })}
    />
  );
}
