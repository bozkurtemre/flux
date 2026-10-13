// Endpoints, at the bottom where the terminal sits: every endpoint Flux has derived, across every
// stream and connection, in one table — the slowest, the most failing, the busiest. It reads the
// cache the tree fills and never the network, so it opens at once; a stream nobody has expanded
// or refreshed has nothing here yet, and says so. A row opens that endpoint's console.
import { useEffect, useState } from "react";
import { RotateCw, Search } from "lucide-react";
import * as cache from "@/lib/cache";
import type { EndpointRow } from "@/lib/endpoints";
import type { Connection } from "@/lib/settings";
import { deriveEndpoints, useApp } from "@/store";
import { failureReason } from "@/lib/progress";
import { SourceIcon } from "./icons";

type Row = EndpointRow & { key: string; conn: Connection; streamId: string; stream: string };
type Sort = "p95" | "failing" | "errors" | "busiest";

const SORTS: { id: Sort; label: string; tip: string }[] = [
  { id: "p95", label: "Slowest", tip: "By the 95th percentile of the response time" },
  { id: "failing", label: "Failing", tip: "By the share of requests that answered 5xx" },
  { id: "errors", label: "Errors", tip: "By how many requests answered 5xx" },
  { id: "busiest", label: "Busiest", tip: "By requests" },
];

/** ponytail: the table draws this many; the filter narrows to the rest, virtualize if it must. */
const SHOWN = 300;

const order: Record<Sort, (a: Row, b: Row) => number> = {
  p95: (a, b) => (b.p95Ms ?? -1) - (a.p95Ms ?? -1) || b.requests - a.requests,
  failing: (a, b) => b.errorRatePct - a.errorRatePct || b.errors - a.errors,
  errors: (a, b) => b.errors - a.errors || b.errorRatePct - a.errorRatePct,
  busiest: (a, b) => b.requests - a.requests,
};

export function EndpointsPanel() {
  const { settings, nodes, openTab, refresh, notify } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  // bumped after a refresh, so the table reads the cache again even where the tree had no node
  const [version, setVersion] = useState(0);
  const [all, setAll] = useState<{ rows: Row[]; streams: number; oldest: string }>({ rows: [], streams: 0, oldest: "" });
  const [sort, setSort] = useState<Sort>("p95");
  const [filter, setFilter] = useState("");

  // read again whenever the tree loads something, since that is when the cache changes
  useEffect(() => {
    let alive = true;
    void (async () => {
      const rows: Row[] = [];
      let streams = 0;
      let oldest = "";
      for (const conn of settings.connections) {
        const c = await cache.load(cache.cacheKey(conn.id)).catch(() => null);
        if (!c) continue;
        for (const [streamId, entry] of Object.entries(c.byStream)) {
          if (!entry.endpoints.length) continue;
          streams++;
          if (!oldest || entry.fetchedAt < oldest) oldest = entry.fetchedAt;
          const stream = c.streams.find((s) => s.id === streamId)?.title ?? streamId;
          for (const e of entry.endpoints) rows.push({ ...e, key: `${conn.id}:${streamId}:${e.method}:${e.endpoint}`, conn, streamId, stream });
        }
      }
      if (alive) setAll({ rows, streams, oldest });
    })();
    return () => {
      alive = false;
    };
  }, [settings.connections, nodes, version]);

  // each stream on the table derived again from the source; three at a time, since one is an
  // aggregation over the stream's whole lookback. A stream the tree shows is refreshed through
  // the tree, so its children change with it; the rest are derived straight into the cache.
  const refreshAll = async () => {
    if (refreshing) return;
    const streams = [...new Map(all.rows.map((r) => [`s:${r.conn.id}:${r.streamId}`, r])).entries()];
    setRefreshing(true);
    let failed = 0;
    try {
      const queue = [...streams];
      await Promise.all(
        Array.from({ length: Math.min(3, queue.length) }, async () => {
          for (let next = queue.shift(); next; next = queue.shift()) {
            const [id, r] = next;
            await (nodes[id] ? refresh(id) : deriveEndpoints(r.conn, r.streamId).then(() => {})).catch(() => failed++);
          }
        }),
      );
      if (failed)
        notify(
          "warning",
          "Some endpoints were not refreshed",
          `${failed} of ${streams.length} streams could not be read; they keep what was cached.`,
        );
    } catch (e) {
      notify("error", "Could not refresh the endpoints", failureReason(e));
    } finally {
      setRefreshing(false);
      setVersion((v) => v + 1);
    }
  };

  const needle = filter.trim().toLowerCase();
  const shown = all.rows
    .filter((r) => !needle || `${r.method} ${r.endpoint} ${r.stream} ${r.conn.name}`.toLowerCase().includes(needle))
    .sort(order[sort]);
  const slowest = Math.max(1, ...shown.slice(0, SHOWN).map((r) => r.p95Ms ?? 0));

  const open = (r: Row) =>
    openTab({
      id: `e:${r.conn.id}:${r.streamId}:${r.method}:${r.endpoint}`,
      kind: "endpoint",
      label: r.endpoint,
      sub: r.method,
      connId: r.conn.id,
      streamId: r.streamId,
      endpoint: r,
      depth: 0,
    });

  const head = "px-2 text-right font-medium";
  const cols = "56px minmax(220px,1fr) minmax(140px,220px) 80px 64px 64px 150px";

  return (
    <div className="island flex h-full flex-col overflow-hidden text-[12px]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: "var(--border-soft)" }}>
        <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
          Endpoints
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {all.rows.length.toLocaleString()} across {all.streams} {all.streams === 1 ? "stream" : "streams"}
          {all.oldest &&
            ` · over the last ${settings.tree.lookbackHours}h, as of ${new Date(all.oldest).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span
            className="flex h-[22px] w-[200px] items-center gap-1.5 rounded-[4px] px-2"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}
          >
            <Search size={11} style={{ color: "var(--text-muted)" }} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter endpoints"
              spellCheck={false}
              className="selectable h-full w-full bg-transparent text-[11.5px] outline-none placeholder:text-[var(--text-muted)]"
              style={{ color: "var(--text)" }}
            />
          </span>
          <span className="flex rounded-[5px] p-px" style={{ background: "var(--bg-input)" }}>
            {SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                data-tip={s.tip}
                className="h-[20px] rounded-[4px] px-2 text-[11px]"
                style={{ background: s.id === sort ? "var(--bg-active)" : undefined, color: s.id === sort ? "var(--text)" : "var(--text-dim)" }}
              >
                {s.label}
              </button>
            ))}
          </span>
          <button
            onClick={() => void refreshAll()}
            disabled={!all.rows.length}
            aria-busy={refreshing}
            data-tip="Derive every stream's endpoints again from the source"
            className="flex size-[22px] items-center justify-center rounded hover:bg-[var(--bg-hover)] disabled:opacity-40"
            style={{ color: "var(--text-dim)" }}
          >
            <RotateCw size={12} className={refreshing ? "animate-spin" : undefined} />
          </button>
        </span>
      </div>

      {!all.rows.length ? (
        <p className="px-3 py-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
          No endpoints yet. They are derived from a stream&apos;s traffic when it is expanded in the Connection Explorer, or refreshed there, and
          every one Flux has derived shows up here.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div
            className="sticky top-0 z-[1] grid h-[24px] items-center text-[11px]"
            style={{
              gridTemplateColumns: cols,
              background: "var(--bg-tool)",
              color: "var(--text-dim)",
              borderBottom: "1px solid var(--border-soft)",
            }}
          >
            <span className="px-3">Method</span>
            <span className="px-2">Endpoint</span>
            <span className="px-2">Stream</span>
            <span className={head}>Requests</span>
            <span className={head}>5xx</span>
            <span className={head}>Error %</span>
            <span className={head}>p95</span>
          </div>
          {shown.slice(0, SHOWN).map((r) => (
            <button
              key={r.key}
              onClick={() => open(r)}
              data-tip="Open its console"
              className="grid h-[24px] w-full items-center text-left hover:bg-[var(--bg-hover)]"
              style={{ gridTemplateColumns: cols }}
            >
              <span className="px-3 font-[var(--font-mono)] text-[11px]" style={{ color: "var(--text-dim)" }}>
                {r.method || "—"}
              </span>
              <span className="truncate px-2 font-[var(--font-mono)] text-[11.5px]" style={{ color: "var(--text)" }}>
                {r.endpoint}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 px-2" style={{ color: "var(--text-muted)" }}>
                <SourceIcon kind={r.conn.kind} />
                <span className="truncate">{r.stream}</span>
              </span>
              <span className="px-2 text-right tabular-nums">{r.requests.toLocaleString()}</span>
              <span className="px-2 text-right tabular-nums" style={{ color: r.errors ? "var(--red)" : "var(--text-muted)" }}>
                {r.errors.toLocaleString()}
              </span>
              <span className="px-2 text-right tabular-nums" style={{ color: r.errorRatePct >= 1 ? "var(--red)" : "var(--text-muted)" }}>
                {r.errorRatePct ? `${r.errorRatePct.toFixed(r.errorRatePct < 10 ? 1 : 0)}%` : "—"}
              </span>
              {/* the time as a bar against the slowest on screen, so the outliers stand out */}
              <span className="flex items-center justify-end gap-2 px-3 tabular-nums">
                {r.p95Ms != null && (
                  <span className="h-[4px] w-[56px] overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(r.p95Ms / slowest) * 100}%`, background: r.p95Ms >= 1000 ? "var(--amber)" : "var(--accent)" }}
                    />
                  </span>
                )}
                <span className="w-[56px] text-right">
                  {r.p95Ms == null ? "—" : r.p95Ms >= 1000 ? `${(r.p95Ms / 1000).toFixed(1)} s` : `${Math.round(r.p95Ms)} ms`}
                </span>
              </span>
            </button>
          ))}
          {shown.length > SHOWN && (
            <p className="px-3 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
              {(shown.length - SHOWN).toLocaleString()} more — filter to narrow them down.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
