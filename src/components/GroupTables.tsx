// The answers to the `| group by` clauses, stacked above the messages: one table per
// clause, in the order they were written, each with its own scroll so a field with a
// thousand values cannot push the others off the screen.
//
// It is the result grid's table, down to the row-number gutter and the striping, because it
// is the same kind of answer — a header of columns and rows under it. Its two columns never
// change: the clause that was asked, and the count that came back. What it is not is the
// same component: no virtualiser, no sorting, no columns to drag, no footer.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardCopy, FileSearch, SquarePen } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import { NUM_W, defaultWidth, render } from "./ResultGrid";
import { messageField, patternsOf } from "@/lib/patterns";
import { parseQuery } from "@/lib/query";
import { useApp, type GroupResult, type Tab } from "@/store";

const COUNT_W = 110;

export function GroupTables({ tab }: { tab: Tab }) {
  const groups = tab.groups ?? [];
  // the templates are counted here, over the rows on screen: it is the same table as a
  // grouped one, answered without asking Graylog anything
  const asked = parseQuery(tab.query).patterns;
  const patterns = useMemo((): GroupResult | null => {
    if (asked === undefined || !tab.page?.rows.length) return null;
    const field = asked || messageField(tab.page.columns);
    const found = patternsOf(tab.page.rows, field);
    return { field: `patterns in ${field}`, rows: found.map((p) => ({ value: p.template, count: p.count, sample: p.sample })) };
  }, [asked, tab.page]);

  if (!groups.length && !patterns) return null;
  return (
    <div className="flex shrink-0 flex-col overflow-auto" style={{ maxHeight: "50%", borderBottom: "1px solid var(--border)" }}>
      {patterns && <GroupTable key="patterns" group={patterns} counted={tab.page?.rows.length} tabId={tab.id} />}
      {groups.map((g) => (
        <GroupTable key={g.field} group={g} />
      ))}
    </div>
  );
}

function GroupTable({ group, counted, tabId }: { group: GroupResult; counted?: number; tabId?: string }) {
  // a pattern is a problem with a name, which is most of what an issue is
  const [menu, setMenu] = useState<{ x: number; y: number; template: string; count: number; sample: string } | null>(null);
  const r = useApp((s) => s.settings.results);
  // Graylog answers with the largest count first, which is the order worth keeping until a
  // header is clicked
  const [sort, setSort] = useState<{ col: "value" | "count"; dir: 1 | -1 } | null>(null);
  // collapsed it is a header and nothing else, so several clauses can be stacked and only
  // the one being read left open
  const [open, setOpen] = useState(true);
  const line = `${r.rowHeight}px`;
  const width = defaultWidth(group.field);
  const rows = useMemo(() => {
    if (!sort) return group.rows;
    return [...group.rows].sort((a, b) =>
      sort.col === "count" ? (a.count - b.count) * sort.dir : a.value.localeCompare(b.value, undefined, { numeric: true }) * sort.dir,
    );
  }, [group.rows, sort]);
  const toggle = (col: "value" | "count") => setSort((s) => (s?.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: 1 }));
  const arrow = (col: "value" | "count") => (sort?.col === col ? <span style={{ color: "var(--accent)" }}>{sort.dir === 1 ? "▲" : "▼"}</span> : null);
  const head = {
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-dim)",
  } as const;

  return (
    <div className="shrink-0 overflow-auto" style={{ maxHeight: open ? 220 : undefined, borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ width: NUM_W + width + COUNT_W, minWidth: "100%" }}>
        <div className="sticky top-0 z-10 flex h-[26px]" style={{ background: "var(--bg-tool)" }}>
          <button
            onClick={() => setOpen((v) => !v)}
            data-tip={open ? "Collapse" : "Expand"}
            className="flex shrink-0 items-center justify-center hover:bg-[var(--bg-hover)]"
            style={{ width: NUM_W, ...head }}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          <div
            onClick={() => toggle("value")}
            className="flex shrink-0 items-center gap-1.5 truncate px-2 text-[11px] font-medium"
            style={{ width, userSelect: "none", ...head }}
            title={`group by ${group.field}`}
          >
            <span style={{ color: "var(--accent)" }}>{counted ? "" : "group by"}</span>
            <span className="truncate font-[var(--font-mono)]">{group.field}</span>
            {arrow("value")}
          </div>
          <div
            onClick={() => toggle("count")}
            className="flex shrink-0 items-center gap-1 px-2 text-[11px] font-medium"
            style={{ width: COUNT_W, userSelect: "none", ...head }}
            title={counted ? `counted in the ${counted.toLocaleString()} rows on screen` : undefined}
          >
            count
            {arrow("count")}
          </div>
        </div>

        {!open ? null : group.error ? (
          <p className="selectable px-2 py-1.5 font-[var(--font-mono)] text-[11px]" style={{ color: "var(--red)" }}>
            {group.error}
          </p>
        ) : !rows.length ? (
          <p className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Nothing matched
          </p>
        ) : (
          rows.map((row, i) => (
            <div
              key={row.value}
              className="flex"
              style={{ height: r.rowHeight, background: r.stripedRows && i % 2 ? "var(--row-alt)" : undefined }}
              onContextMenu={(e) => {
                if (!tabId || row.sample === undefined) return;
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, template: row.value, count: row.count, sample: row.sample });
              }}
            >
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
      {menu && tabId && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            { label: "Create Jira issue", icon: <SquarePen size={12} />, onClick: () => useApp.getState().issueFromPattern(tabId, menu) },
            {
              label: "Where is this logged?",
              icon: <FileSearch size={12} />,
              onClick: () => void useApp.getState().whereLogged(tabId, menu.template),
            },
            { label: "Copy pattern", icon: <ClipboardCopy size={12} />, onClick: () => void navigator.clipboard.writeText(menu.template) },
            { label: "Copy a sample", icon: <ClipboardCopy size={12} />, onClick: () => void navigator.clipboard.writeText(menu.sample) },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
