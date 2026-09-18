// What the results are made of, under the tree: every field in the rows on screen, how many
// of them carry it, and the values it takes. Clicking a value narrows the search to it, and
// clicking the field counts by it — the same two things the row menu offers, reached from the
// other end, before you know which row you are looking for.
import { useState } from "react";
import { ChevronDown, ChevronRight, Filter, FilterX, Rows3 } from "lucide-react";
import { fieldsOf } from "@/lib/patterns";
import { useApp } from "@/store";

export function FieldsPanel() {
  const { tabs, activeTab, filterByField, groupByField } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const tab = tabs.find((t) => t.id === activeTab);
  // the compiler memoises this for us, and does it better than a dependency on an optional
  const rows = tab?.page?.rows ?? [];
  const fields = rows.length ? fieldsOf(rows) : [];

  const needle = filter.trim().toLowerCase();
  const shown = needle ? fields.filter((f) => f.name.toLowerCase().includes(needle)) : fields;

  return (
    <div className="island flex h-full flex-col overflow-hidden">
      <div className="flex h-[26px] shrink-0 items-center gap-2 px-3">
        <span className="text-[12px] font-semibold">Fields</span>
        {!!rows.length && (
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            in {rows.length.toLocaleString()} rows
          </span>
        )}
      </div>

      {!rows.length ? (
        <p className="px-3 pb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Run a query and its fields are listed here.
        </p>
      ) : (
        <>
          <div className="mx-2 mb-1 flex h-[24px] shrink-0 items-center gap-1.5 rounded px-2" style={{ background: "var(--bg-input)" }}>
            <Filter size={11} style={{ color: "var(--text-muted)" }} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter fields…"
              spellCheck={false}
              className="selectable h-full w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
              style={{ color: "var(--text)" }}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto pb-1">
            {shown.map((f) => {
              const expanded = open === f.name;
              return (
                <div key={f.name}>
                  <div
                    onClick={() => setOpen(expanded ? null : f.name)}
                    className="group flex h-[22px] cursor-default items-center gap-1 pr-2 pl-1.5 text-[12px] hover:bg-[var(--bg-hover)]"
                  >
                    {expanded ? (
                      <ChevronDown size={11} style={{ color: "var(--text-dim)" }} />
                    ) : (
                      <ChevronRight size={11} style={{ color: "var(--text-dim)" }} />
                    )}
                    <span className="truncate font-[var(--font-mono)]">{f.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tab) groupByField(tab.id, f.name);
                      }}
                      data-tip="Count by this field"
                      className="ml-auto flex size-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-active)]"
                      style={{ color: "var(--text-dim)" }}
                    >
                      <Rows3 size={11} />
                    </button>
                    <span className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)", fontSize: 10 }}>
                      {Math.round((f.filled / rows.length) * 100)}%
                    </span>
                  </div>

                  {expanded &&
                    f.top.map((v) => (
                      <div
                        key={v.value}
                        className="group flex h-[20px] items-center gap-1 pr-2 pl-6 text-[11px] hover:bg-[var(--bg-hover)]"
                        title={v.value}
                      >
                        <span className="truncate font-[var(--font-mono)]" style={{ color: "var(--text-dim)" }}>
                          {v.value}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => tab && filterByField(tab.id, f.name, v.value)}
                            data-tip="Filter by this value"
                            className="flex size-4 items-center justify-center rounded hover:bg-[var(--bg-active)]"
                            style={{ color: "var(--text-dim)" }}
                          >
                            <Filter size={10} />
                          </button>
                          <button
                            onClick={() => tab && filterByField(tab.id, f.name, v.value, true)}
                            data-tip="Exclude this value"
                            className="flex size-4 items-center justify-center rounded hover:bg-[var(--bg-active)]"
                            style={{ color: "var(--text-dim)" }}
                          >
                            <FilterX size={10} />
                          </button>
                        </span>
                        <span className="shrink-0 tabular-nums group-hover:hidden" style={{ color: "var(--text-muted)", fontSize: 10 }}>
                          {v.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
