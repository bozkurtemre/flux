// The answers to the `| group by` clauses, stacked above the messages: one table per
// clause, in the order they were written, each with its own scroll so a field with a
// thousand values cannot push the others off the screen.
import { useApp, type GroupResult, type Tab } from "@/store";

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
  const total = group.rows.reduce((a, row) => a + row.count, 0);

  return (
    <div className="shrink-0" style={{ borderBottom: "1px solid var(--border-soft)" }}>
      <div
        className="sticky top-0 z-10 flex h-[22px] items-center gap-2 px-2 text-[11px]"
        style={{ background: "var(--bg-tool)", borderBottom: "1px solid var(--border)", color: "var(--text-dim)" }}
      >
        <span style={{ color: "var(--accent)" }}>group by</span>
        <span className="font-[var(--font-mono)]" style={{ color: "var(--text)" }}>
          {group.field}
        </span>
        <span className="ml-auto tabular-nums" style={{ color: "var(--text-muted)" }}>
          {group.error ? "" : `${group.rows.length} values · ${total.toLocaleString()} messages`}
        </span>
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
        <div className="max-h-[180px] overflow-auto">
          {group.rows.map((row) => (
            <div key={row.value} className="flex" style={{ height: r.rowHeight }}>
              <div
                className="flex-1 truncate px-2 font-[var(--font-mono)]"
                style={{ fontSize: r.fontSize, lineHeight: line, borderRight: "1px solid var(--border-soft)" }}
                title={row.value}
              >
                {row.value || r.nullText}
              </div>
              <div
                className="w-[120px] shrink-0 px-2 text-right font-[var(--font-mono)] tabular-nums"
                style={{ fontSize: r.fontSize, lineHeight: line, color: "var(--text-dim)" }}
              >
                {row.count.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
