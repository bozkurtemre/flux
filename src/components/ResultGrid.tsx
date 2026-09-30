import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ClipboardCopy, Clock, Columns3, Filter, FilterX, Route, Rows3, RotateCcw, SquareCode } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { correlationOf } from "@/lib/correlation";
import { curlOf } from "@/lib/curl";
import { ClaudeIcon } from "./icons";
import { sendToClaude } from "./TerminalPanel";
import { useApp, type Tab } from "@/store";
import { moveBefore } from "@/lib/reorder";

export const NUM_W = 52;

/** The same identity the tail uses to tell a new message from one already on screen. */
const rowKey = (row: Record<string, unknown>) => String(row.gl2_message_id ?? `${String(row.timestamp)}|${String(row.message)}`);

/** The result grid: a row-number gutter, sortable headers, one-line cells. */
export function ResultGrid({ tab }: { tab: Tab }) {
  const { patchTab, settings, setColumns } = useApp();
  const r = settings.results;
  const ROW = r.rowHeight;
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<{ col: string; dx: number } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; index: number; row: Record<string, unknown>; col?: string } | null>(null);
  const draggedRef = useRef(false);

  /**
   * Moving a column, on plain pointer events: the webview swallows HTML5 drag, and this
   * follows the cursor from the first few pixels rather than after the browser decides a
   * drag has begun. Under the threshold it stays a click, which sorts.
   */
  const startColumnDrag = (e: React.MouseEvent, col: string) => {
    if (e.button !== 0) return;
    e.preventDefault(); // otherwise the press begins selecting the header's own name
    const from = e.clientX;
    draggedRef.current = false;
    let over: string | null = null;

    const move = (ev: MouseEvent) => {
      if (!draggedRef.current && Math.abs(ev.clientX - from) < 4) return;
      draggedRef.current = true;
      // the header follows the pointer, and is pointer-transparent while it does, so the
      // column found underneath is the one it is being dropped on rather than itself
      setDrag({ col, dx: ev.clientX - from });
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-col]");
      const name = under instanceof HTMLElement ? (under.dataset.col ?? null) : null;
      over = name && name !== col ? name : null;
      setDropOn(over);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (draggedRef.current && over) setColumns(tab.id, moveBefore(columns, col, over));
      setDrag(null);
      setDropOn(null);
      // let the click that follows this mouse-up see the flag, then forget it
      setTimeout(() => (draggedRef.current = false), 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const parentRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => {
    if (tab.layout?.length) return tab.layout;
    const cols = tab.page?.columns ?? [];
    const preferred = [
      "timestamp",
      "level_name",
      "level",
      "source",
      "method",
      "route",
      "uri",
      "httpStatusCode",
      "httpStatus",
      "responseTime",
      "message",
    ];
    return [...cols].sort((a, b) => {
      const ia = preferred.indexOf(a);
      const ib = preferred.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }, [tab.page, tab.layout]);

  const rows = useMemo(() => {
    const r = tab.page?.rows ?? [];
    if (!sort) return r;
    return [...r].sort((a, b) => {
      const x = String(a[sort.col] ?? "");
      const y = String(b[sort.col] ?? "");
      return x.localeCompare(y, undefined, { numeric: true }) * sort.dir;
    });
  }, [tab.page, sort]);

  // Rows arriving on top would otherwise push what is being read down the screen: the
  // scroller is moved by as much as was added, so the page under the cursor does not move.
  const lastTick = useRef(0);
  useLayoutEffect(() => {
    const tail = tab.tail;
    if (!tail || tail.tick === lastTick.current) return;
    const first = lastTick.current === 0;
    lastTick.current = tail.tick;
    const el = parentRef.current;
    if (!first && el && el.scrollTop > 0) el.scrollTop += tail.added * ROW;
  }, [tab.tail, ROW]);
  const fresh = useMemo(() => new Set(tab.tail?.keys ?? []), [tab.tail]);

  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW, overscan: 25 });
  const line = `${ROW}px`;
  const width = (c: string) => widths[c] ?? defaultWidth(c);

  if (tab.error) {
    return (
      <div className="selectable h-full overflow-auto p-4 font-[var(--font-mono)] text-[12px]" style={{ color: "var(--red)" }}>
        {tab.error}
      </div>
    );
  }
  if (!tab.page) {
    return (
      <div className="flex h-full items-center justify-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        {tab.running ? "Executing…" : "No results yet"}
      </div>
    );
  }

  // Arrows walk the rows once the grid has the focus. The window handler moves the tree
  // with the same keys, so the event stops here rather than doing both at once.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (!rows.length) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.key === "ArrowDown" ? 1 : -1;
    const at = tab.selectedRow ?? (step === 1 ? -1 : rows.length);
    const next = Math.max(0, Math.min(rows.length - 1, at + step));
    patchTab(tab.id, { selectedRow: next });
    v.scrollToIndex(next, { align: "auto" });
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={parentRef} tabIndex={0} onKeyDown={onKey} className="min-h-0 flex-1 overflow-auto outline-none">
        <div style={{ width: NUM_W + columns.reduce((a, c) => a + width(c), 0), minWidth: "100%" }}>
          {/* header */}
          <div className="sticky top-0 z-10 flex h-[26px]" style={{ background: "var(--bg-tool)" }}>
            <div className="shrink-0" style={{ width: NUM_W, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }} />
            {columns.map((c) => (
              <div
                key={c}
                data-col={c}
                onMouseDown={(e) => startColumnDrag(e, c)}
                onClick={() => {
                  // the mouse-up that ends a drag also fires a click; that one is not a sort
                  if (draggedRef.current) return;
                  setSort((s) => (s?.col === c ? { col: c, dir: s.dir === 1 ? -1 : 1 } : { col: c, dir: 1 }));
                }}
                className="flex shrink-0 items-center gap-1 truncate px-2 text-[11px] font-medium"
                style={{
                  width: width(c),
                  borderRight: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                  borderLeft: dropOn === c ? "2px solid var(--accent)" : undefined,
                  color: "var(--text-dim)",
                  cursor: drag ? "grabbing" : "default",
                  userSelect: "none",
                  background: drag?.col === c ? "var(--bg-raised)" : undefined,
                  ...(drag?.col === c
                    ? { transform: `translateX(${drag.dx}px)`, zIndex: 20, pointerEvents: "none" as const, opacity: 0.85 }
                    : { transition: "transform 120ms ease" }),
                }}
                title={c}
              >
                <span className="truncate">{c}</span>
                {sort?.col === c && <span style={{ color: "var(--accent)" }}>{sort.dir === 1 ? "▲" : "▼"}</span>}
                <span
                  onMouseDown={(e) => {
                    e.stopPropagation(); // the edge resizes the column, it does not move it
                    startResize(e, c, width(c), setWidths);
                  }}
                  className="ml-auto -mr-2 h-full w-2 cursor-col-resize"
                />
              </div>
            ))}
          </div>
          {/* rows */}
          <div style={{ height: v.getTotalSize(), position: "relative" }}>
            {v.getVirtualItems().map((item) => {
              const row = rows[item.index];
              const selected = tab.selectedRow === item.index;
              return (
                <div
                  key={item.key}
                  onClick={() => {
                    parentRef.current?.focus(); // so the arrows belong to the grid from here on
                    patchTab(tab.id, { selectedRow: item.index });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    // asking a row what it can do is not asking to inspect it: the selection
                    // follows only while the inspector is already open, because it is the
                    // selection that opens it
                    if (tab.selectedRow != null) patchTab(tab.id, { selectedRow: item.index });
                    // the cell under the pointer decides what "this field" means; the gutter
                    // is a row without one
                    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
                    setMenu({ x: e.clientX, y: e.clientY, index: item.index, row, col: cell?.dataset.cell });
                  }}
                  className="absolute left-0 flex w-full"
                  style={{
                    height: ROW,
                    transform: `translateY(${item.start}px)`,
                    background: selected
                      ? "var(--sel-focus)"
                      : menu?.index === item.index
                        ? "var(--bg-active)"
                        : fresh.has(rowKey(row))
                          ? "color-mix(in srgb, var(--green) 14%, transparent)"
                          : r.stripedRows && item.index % 2
                            ? "var(--row-alt)"
                            : undefined,
                    color: selected ? "#fff" : undefined,
                  }}
                >
                  <div
                    className="shrink-0 px-2 text-right font-[var(--font-mono)] text-[11px] tabular-nums"
                    style={{
                      lineHeight: line,
                      width: NUM_W,
                      color: selected ? "#dbe6ff" : "var(--text-muted)",
                      background: selected ? undefined : "var(--bg-tool)",
                      borderRight: "1px solid var(--border)",
                    }}
                  >
                    {item.index + 1}
                  </div>
                  {columns.map((c) => (
                    <div
                      key={c}
                      data-cell={c}
                      className="shrink-0 truncate px-2 font-[var(--font-mono)]"
                      style={{
                        width: width(c),
                        fontSize: r.fontSize,
                        lineHeight: line,
                        borderRight: "1px solid var(--border-soft)",
                        color: selected ? "#fff" : r.colorBySeverity ? cellColor(c, row[c]) : undefined,
                      }}
                    >
                      {render(row[c], c, r)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={rowMenu(tab, menu.row, menu.col)} onClose={() => setMenu(null)} />}
      <GridFooter tab={tab} count={rows.length} columns={columns} />
    </div>
  );
}

/** Five minutes either side is a whole story either side of a single line. */
const AROUND_SECONDS = 300;

/**
 * What a log row offers: what it narrows the search to, what it counts, what was happening
 * around it, and the three ways of taking it somewhere else.
 */
function rowMenu(tab: Tab, row: Record<string, unknown>, col?: string): MenuItem[] {
  const copy = <ClipboardCopy size={12} />;
  const app = useApp.getState();
  const at = String(row.timestamp ?? "");
  const follow = correlationOf(row, col);
  const curl = curlOf(row);
  return [
    {
      label: follow ? `Follow this ${follow.field}` : "Follow this request",
      icon: <Route size={12} />,
      disabled: !follow,
      onClick: () => void app.followRequest(tab.id, row, col),
    },
    { separator: true },
    {
      label: col ? `Filter by ${col}` : "Filter by this field",
      icon: <Filter size={12} />,
      disabled: !col,
      onClick: () => app.filterByField(tab.id, col!, row[col!]),
    },
    {
      label: col ? `Exclude ${col}` : "Exclude this field",
      icon: <FilterX size={12} />,
      disabled: !col,
      onClick: () => app.filterByField(tab.id, col!, row[col!], true),
    },
    {
      label: col ? `Group by ${col}` : "Group by this field",
      icon: <Rows3 size={12} />,
      disabled: !col,
      onClick: () => app.groupByField(tab.id, col!),
    },
    {
      label: col ? `Find patterns in ${col}` : "Find message patterns",
      icon: <Rows3 size={12} />,
      onClick: () => app.showPatterns(tab.id, col ?? ""),
    },
    {
      label: "Show 5 minutes around this",
      icon: <Clock size={12} />,
      disabled: !at || Number.isNaN(new Date(at).getTime()),
      onClick: () => app.openAround(tab.id, at, AROUND_SECONDS),
    },
    { separator: true },
    {
      // the request the row describes, made again: authentication left out, as it would be
      // wherever the command is going to be pasted
      label: "Copy as cURL",
      icon: <SquareCode size={12} />,
      disabled: !curl,
      onClick: () => curl && void navigator.clipboard.writeText(curl),
    },
    {
      label: col ? `Copy field: ${col}` : "Copy field",
      icon: copy,
      disabled: !col,
      onClick: () => void navigator.clipboard.writeText(String(row[col!] ?? "")),
    },
    { label: "Copy row (JSON)", icon: copy, onClick: () => void navigator.clipboard.writeText(JSON.stringify(row, null, 2)) },
    {
      label: "Paste to Claude",
      icon: <ClaudeIcon size={13} />,
      onClick: () => void sendToClaude(JSON.stringify(row)),
    },
  ];
}

const PAGE_SIZES = [100, 250, 500, 1000];

function GridFooter({ tab, count, columns }: { tab: Tab; count: number; columns: string[] }) {
  const { runQuery, settings, setPage, setPageSize } = useApp();
  const [picking, setPicking] = useState(false);
  const [sizing, setSizing] = useState(false);
  const size = settings.results.pageSize;
  const offset = tab.offset ?? 0;
  const step = "rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)] disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <div
      className="relative flex h-[26px] shrink-0 items-center gap-3 px-2 text-[11px]"
      style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}
    >
      <button onClick={() => void runQuery(tab.id)} className="rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)]">
        Reload
      </button>
      <button onClick={() => setSizing((v) => !v)} data-tip="Rows per page" className="rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)]">
        {count} rows
      </button>
      {sizing && (
        <Popup onClose={() => setSizing(false)} className="bottom-[30px] left-16 w-[120px]">
          {PAGE_SIZES.map((n) => (
            <button
              key={n}
              onClick={() => {
                setPageSize(tab.id, n);
                setSizing(false);
              }}
              className="flex h-[24px] w-full items-center gap-2 px-2.5 text-[12px] hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text)" }}
            >
              <span style={{ width: 12, color: "var(--accent)" }}>{n === size ? "✓" : ""}</span>
              {n} rows
            </button>
          ))}
        </Popup>
      )}
      <span className="flex items-center gap-0.5">
        <button className={step} disabled={offset === 0} onClick={() => setPage(tab.id, offset - size)} data-tip="Previous page">
          <ChevronLeft size={13} />
        </button>
        <span className="tabular-nums" style={{ minWidth: 72, textAlign: "center" }}>
          {count ? `${offset + 1}–${offset + count}` : "—"}
        </span>
        <button
          className={step}
          // a short page is the end of it; with a total we also know the end before reaching it
          disabled={count < size || offset + count >= (tab.total ?? Infinity)}
          onClick={() => setPage(tab.id, offset + size)}
          data-tip="Next page"
        >
          <ChevronRight size={13} />
        </button>
      </span>
      {tab.total != null && <span>total {tab.total.toLocaleString()}</span>}
      {tab.took != null && <span>{tab.took} ms</span>}
      <span className="ml-auto flex items-center gap-2">
        <button
          onClick={() => setPicking((v) => !v)}
          data-tip="Columns"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)]"
          style={{ color: tab.layout?.length ? "var(--accent)" : undefined }}
        >
          <Columns3 size={12} />
          Columns
        </button>
      </span>
      {picking && <ColumnPicker tab={tab} columns={columns} onClose={() => setPicking(false)} />}
    </div>
  );
}

/** A small panel above the footer, closed by Escape or by clicking anywhere else. */
function Popup({ children, onClose, className }: { children: ReactNode; onClose: () => void; className: string }) {
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
  return (
    <div
      ref={ref}
      className={`absolute z-30 flex max-h-[320px] flex-col overflow-hidden rounded-[8px] py-1 ${className}`}
      style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 14px 40px rgba(0,0,0,.55)" }}
    >
      {children}
    </div>
  );
}

/**
 * Which columns are on screen. The list is every field this stream has, so a field that the
 * last query did not ask for can be ticked here and fetched by the next one.
 */
function ColumnPicker({ tab, columns, onClose }: { tab: Tab; columns: string[]; onClose: () => void }) {
  const { setColumns, resetColumns } = useApp();

  const available = useMemo(() => {
    const all = new Set([...columns, ...(tab.page?.columns ?? []), ...tab.fields.map((f) => f.name)]);
    return [...all].sort((a, b) => a.localeCompare(b));
  }, [columns, tab.page, tab.fields]);

  const toggle = (name: string) => {
    const on = columns.includes(name);
    // unticking the last one would leave a grid with nothing in it
    if (on && columns.length === 1) return;
    setColumns(tab.id, on ? columns.filter((c) => c !== name) : [...columns, name]);
  };

  return (
    <Popup onClose={onClose} className="right-2 bottom-[30px] w-[260px]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {available.map((name) => (
          <label key={name} className="flex h-[24px] cursor-default items-center gap-2 px-2.5 text-[12px] hover:bg-[var(--bg-hover)]">
            <input type="checkbox" checked={columns.includes(name)} onChange={() => toggle(name)} />
            <span className="truncate" style={{ color: "var(--text)" }} title={name}>
              {name}
            </span>
          </label>
        ))}
      </div>
      <button
        onClick={() => {
          resetColumns(tab.id);
          onClose();
        }}
        className="mx-1 mt-1 flex items-center gap-1.5 rounded px-1.5 py-1 text-[12px] hover:bg-[var(--bg-hover)]"
        style={{ borderTop: "1px solid var(--border-soft)", color: "var(--text-dim)" }}
      >
        <RotateCcw size={11} />
        Reset to default
      </button>
    </Popup>
  );
}

export function defaultWidth(c: string) {
  if (c === "timestamp") return 190;
  if (c === "message" || c === "full_message") return 640;
  if (c === "source") return 200;
  if (c === "route" || c === "uri") return 260;
  if (/status|level|method|response|request/i.test(c)) return 110;
  return 160;
}

function cellColor(col: string, v: unknown) {
  const s = String(v ?? "");
  if (/^level(_name)?$/.test(col)) {
    if (/ERROR|CRITICAL|FATAL|ALERT|EMERGENCY/i.test(s)) return "var(--red)";
    if (/WARN/i.test(s)) return "var(--amber)";
    return "var(--text-dim)";
  }
  if (/status/i.test(col)) {
    const n = Number(s);
    if (n >= 500) return "var(--red)";
    if (n >= 400) return "var(--amber)";
    if (n >= 200 && n < 300) return "var(--green)";
  }
  if (col === "timestamp") return "var(--text-dim)";
  if (typeof v === "number") return "var(--syn-num)";
  return undefined;
}

export function render(v: unknown, col: string, r: { nullText: string; timezone: "local" | "utc"; timestampFormat: "iso" | "short" | "time" }) {
  if (v == null || v === "") return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{r.nullText}</span>;
  if (col === "timestamp" || /(^|_)(time|date)$/i.test(col)) {
    const d = new Date(String(v));
    if (!Number.isNaN(d.getTime())) return formatTs(d, r.timezone, r.timestampFormat);
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Timestamps follow Settings > Results; UTC is rendered from the ISO string to avoid a locale round-trip. */
export function formatTs(d: Date, tz: "local" | "utc", fmt: "iso" | "short" | "time"): string {
  const iso = tz === "utc" ? d.toISOString() : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString();
  if (fmt === "iso") return tz === "utc" ? iso : iso.replace("Z", "");
  if (fmt === "time") return iso.slice(11, 23);
  return iso.replace("T", " ").slice(0, 19);
}

function startResize(e: React.MouseEvent, col: string, start: number, set: (f: (w: Record<string, number>) => Record<string, number>) => void) {
  e.preventDefault();
  e.stopPropagation();
  const x0 = e.clientX;
  const move = (ev: MouseEvent) => set((w) => ({ ...w, [col]: Math.max(60, start + ev.clientX - x0) }));
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}
