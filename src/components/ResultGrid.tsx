import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useApp, type Tab } from "@/store";

const NUM_W = 52;

/** DataGrip's result grid: a row-number gutter, sortable headers, one-line cells. */
export function ResultGrid({ tab }: { tab: Tab }) {
  const { patchTab, settings } = useApp();
  const r = settings.results;
  const ROW = r.rowHeight;
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const parentRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => {
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
  }, [tab.page]);

  const rows = useMemo(() => {
    const r = tab.page?.rows ?? [];
    if (!sort) return r;
    return [...r].sort((a, b) => {
      const x = String(a[sort.col] ?? "");
      const y = String(b[sort.col] ?? "");
      return x.localeCompare(y, undefined, { numeric: true }) * sort.dir;
    });
  }, [tab.page, sort]);

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

  return (
    <div className="flex h-full flex-col">
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ width: NUM_W + columns.reduce((a, c) => a + width(c), 0), minWidth: "100%" }}>
          {/* header */}
          <div className="sticky top-0 z-10 flex h-[26px]" style={{ background: "var(--bg-tool)" }}>
            <div className="shrink-0" style={{ width: NUM_W, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }} />
            {columns.map((c) => (
              <div
                key={c}
                onClick={() => setSort((s) => (s?.col === c ? { col: c, dir: s.dir === 1 ? -1 : 1 } : { col: c, dir: 1 }))}
                className="flex shrink-0 items-center gap-1 truncate px-2 text-[11px] font-medium"
                style={{ width: width(c), borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", color: "var(--text-dim)" }}
                title={c}
              >
                <span className="truncate">{c}</span>
                {sort?.col === c && <span style={{ color: "var(--accent)" }}>{sort.dir === 1 ? "▲" : "▼"}</span>}
                <span onMouseDown={(e) => startResize(e, c, width(c), setWidths)} className="ml-auto -mr-2 h-full w-2 cursor-col-resize" />
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
                  onClick={() => patchTab(tab.id, { selectedRow: item.index })}
                  className="absolute left-0 flex w-full"
                  style={{
                    height: ROW,
                    transform: `translateY(${item.start}px)`,
                    background: selected ? "var(--sel-focus)" : r.stripedRows && item.index % 2 ? "var(--row-alt)" : undefined,
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
                      className="shrink-0 truncate px-2 font-[var(--font-mono)]"
                      style={{
                        width: width(c),
                        fontSize: r.fontSize,
                        lineHeight: line,
                        borderRight: "1px solid var(--border-soft)",
                        color: selected ? "#fff" : r.colorBySeverity ? cellColor(c, row[c]) : undefined,
                      }}
                      title={String(row[c] ?? "")}
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
      <GridFooter tab={tab} count={rows.length} />
    </div>
  );
}

function GridFooter({ tab, count }: { tab: Tab; count: number }) {
  const { runQuery } = useApp();
  return (
    <div
      className="flex h-[26px] shrink-0 items-center gap-3 px-2 text-[11px]"
      style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}
    >
      <button onClick={() => void runQuery(tab.id)} className="rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)]">
        Reload
      </button>
      <span>{count} rows</span>
      {tab.took != null && <span>{tab.took} ms</span>}
      <span className="ml-auto">{count >= 500 ? "first 500 shown" : ""}</span>
    </div>
  );
}

function defaultWidth(c: string) {
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

function render(v: unknown, col: string, r: { nullText: string; timezone: "local" | "utc"; timestampFormat: "iso" | "short" | "time" }) {
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
