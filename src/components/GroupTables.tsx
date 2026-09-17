// The answers to the `| group by` clauses, stacked above the messages: one table per
// clause, in the order they were written, each with its own scroll so a field with a
// thousand values cannot push the others off the screen.
//
// It is the result grid's table, down to the row-number gutter and the striping, because it
// is the same kind of answer — a header of columns and rows under it. Its two columns never
// change: the clause that was asked, and the count that came back. What it is not is the
// same component: no virtualiser, no sorting, no columns to drag, no footer.
import { NUM_W, defaultWidth, render } from "./ResultGrid";
import { useApp, type GroupResult, type Tab } from "@/store";

const COUNT_W = 110;

export function GroupTables({ tab }: { tab: Tab }) {
  const groups = tab.groups ?? [];
  if (!groups.length) return null;
  return (
    <div className="flex shrink-0 flex-col overflow-auto" style={{ maxHeight: "50%", borderBottom: "1px solid var(--border)" }}>
      {groups.map((g) => (
        <GroupTable key={g.field} group={g} />
      ))}
    </div>
  );
}

function GroupTable({ group }: { group: GroupResult }) {
  const r = useApp((s) => s.settings.results);
  const line = `${r.rowHeight}px`;
  const width = defaultWidth(group.field);
  const head = {
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-dim)",
  } as const;

  return (
    <div className="max-h-[220px] shrink-0 overflow-auto" style={{ borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ width: NUM_W + width + COUNT_W, minWidth: "100%" }}>
        <div className="sticky top-0 z-10 flex h-[26px]" style={{ background: "var(--bg-tool)" }}>
          <div className="shrink-0" style={{ width: NUM_W, ...head }} />
          <div
            className="flex shrink-0 items-center gap-1.5 truncate px-2 text-[11px] font-medium"
            style={{ width, ...head }}
            title={`group by ${group.field}`}
          >
            <span style={{ color: "var(--accent)" }}>group by</span>
            <span className="truncate font-[var(--font-mono)]">{group.field}</span>
          </div>
          <div className="flex shrink-0 items-center px-2 text-[11px] font-medium" style={{ width: COUNT_W, ...head }}>
            count
          </div>
        </div>

        {group.error ? (
          <p className="selectable px-2 py-1.5 font-[var(--font-mono)] text-[11px]" style={{ color: "var(--red)" }}>
            {group.error}
          </p>
        ) : !group.rows.length ? (
          <p className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Nothing matched
          </p>
        ) : (
          group.rows.map((row, i) => (
            <div key={row.value} className="flex" style={{ height: r.rowHeight, background: r.stripedRows && i % 2 ? "var(--row-alt)" : undefined }}>
              <div
                className="shrink-0 px-2 text-right font-[var(--font-mono)] text-[11px] tabular-nums"
                style={{
                  width: NUM_W,
                  lineHeight: line,
                  color: "var(--text-muted)",
                  background: "var(--bg-tool)",
                  borderRight: "1px solid var(--border)",
                }}
              >
                {i + 1}
              </div>
              <div
                className="shrink-0 truncate px-2 font-[var(--font-mono)]"
                style={{ width, fontSize: r.fontSize, lineHeight: line, borderRight: "1px solid var(--border-soft)" }}
                title={row.value}
              >
                {render(row.value, group.field, r)}
              </div>
              <div
                className="shrink-0 px-2 text-right font-[var(--font-mono)] tabular-nums"
                style={{
                  width: COUNT_W,
                  fontSize: r.fontSize,
                  lineHeight: line,
                  borderRight: "1px solid var(--border-soft)",
                  color: "var(--text-dim)",
                }}
              >
                {row.count.toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
