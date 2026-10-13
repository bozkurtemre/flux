// Monitor: a connection's health on one screen, in the place of the explorer and its consoles.
// Every ten seconds it asks the source for two exact things — messages and failures per bucket
// across the window — and for the lines that arrived since the last look, which it keeps as a
// tail. The cards and charts come from the first; the breakdowns, the failures that repeat, the
// latency and the live feed from the second. The scope, a connection and one stream or all of
// them, is picked in the corner and kept while Monitor is closed.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import * as cache from "@/lib/cache";
import { absolute, bucketFor, rowKey, type Bucket } from "@/lib/datasource";
import { isFailure } from "@/lib/journey";
import { digest, errorQueryFrom, levelOf, mergeTail, TAIL_FIELDS, timeOf, type Share } from "@/lib/monitor";
import { failureReason } from "@/lib/progress";
import { clientFor, useApp } from "@/store";
import { SourceIcon } from "./icons";
import { Select } from "./settings/controls";
import { formatTs } from "./ResultGrid";

type Row = Record<string, unknown>;

const WINDOWS = [
  { seconds: 900, label: "15m" },
  { seconds: 3600, label: "1h" },
  { seconds: 6 * 3600, label: "6h" },
];
const EVERY = 10_000;
const BUCKETS = 60;

interface Snapshot {
  key: string;
  total: Bucket[];
  errors: Bucket[];
  tail: Row[];
  /** How many lines the last look brought, so the feed can mark them. */
  fresh: number;
  errorQuery: string | null;
  at: number;
  error?: string;
}

export function MonitorView() {
  const { settings, monitorScope, setMonitorScope } = useApp();
  const conn = settings.connections.find((c) => c.id === monitorScope.connId) ?? settings.connections[0];
  const streamId = conn && monitorScope.connId === conn.id ? monitorScope.streamId : undefined;
  const [win, setWin] = useState(WINDOWS[1].seconds);
  const [paused, setPaused] = useState(false);
  const [streams, setStreams] = useState<{ connId: string; list: { id: string; title: string }[] }>({ connId: "", list: [] });
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const key = `${conn?.id}:${streamId ?? "*"}:${win}`;

  // the streams to pick from, and what to call the ids the lines carry
  useEffect(() => {
    if (!conn) return;
    let alive = true;
    void (async () => {
      const cached = await cache.load(cache.cacheKey(conn.id)).catch(() => null);
      let list = cached?.streams ?? [];
      if (!list.length)
        list = await clientFor(conn)
          .streams()
          .catch(() => []);
      if (alive) setStreams({ connId: conn.id, list: list.filter((s) => !s.disabled).map((s) => ({ id: s.id, title: s.title })) });
    })();
    return () => {
      alive = false;
    };
  }, [conn]);

  useEffect(() => {
    if (!conn || paused) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tail: Row[] = snap?.key === key ? snap.tail : [];
    let errorQuery: string | null = snap?.key === key ? snap.errorQuery : null;
    const client = clientFor(conn);
    const scope = streamId ? [streamId] : [];

    const tick = async () => {
      const now = new Date();
      const start = now.getTime() - win * 1000;
      try {
        const newest = tail.length ? timeOf(tail[0]) : 0;
        const page = await client.messages({
          query: "*",
          streams: scope,
          timerange: absolute(new Date(newest || start), now),
          fields: TAIL_FIELDS,
          size: newest ? 500 : 1000,
          signal: abort.signal,
        });
        const before = new Set(tail.map(rowKey));
        tail = mergeTail(tail, page.rows, rowKey, start);
        const fresh = page.rows.filter((r) => !before.has(rowKey(r))).length;
        errorQuery ??= errorQueryFrom(tail);
        const interval = bucketFor(win, BUCKETS);
        const timerange = { type: "relative" as const, range: win };
        const [total, errors] = await Promise.all([
          client.histogram({ query: "*", streams: scope, timerange, interval, signal: abort.signal }),
          errorQuery ? client.histogram({ query: errorQuery, streams: scope, timerange, interval, signal: abort.signal }) : Promise.resolve([]),
        ]);
        setSnap({ key, total, errors, tail, fresh, errorQuery, at: Date.now() });
      } catch (e) {
        if (!abort.signal.aborted) setSnap((s) => (s?.key === key ? { ...s, error: failureReason(e), at: Date.now() } : s));
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void tick(), EVERY);
    };
    void tick();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
    // snap is read once, to carry the tail across a pause; the key names everything else
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, paused]);

  const live = snap?.key === key ? snap : null;
  const titles = useMemo(() => new Map(streams.list.map((s) => [s.id, s.title])), [streams]);
  const streamName = (r: Row) => {
    const s = r.streams;
    const id = Array.isArray(s) ? String(s[0] ?? "") : s ? String(s) : "";
    return id ? (titles.get(id) ?? id) : null;
  };
  const d = useMemo(() => (live ? digest(live.tail, streamName) : null), [live, titles]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!conn) {
    return (
      <div className="island flex h-full items-center justify-center text-[13px]" style={{ color: "var(--text-muted)" }}>
        Add a connection in Settings › Connections, and its health shows up here.
      </div>
    );
  }

  const total = live?.total ?? [];
  const errors = live?.errors ?? [];
  const sum = (b: Bucket[]) => b.reduce((n, x) => n + x.count, 0);
  const totalCount = sum(total);
  const errorCount = sum(errors);
  const span = total.length > 1 ? (new Date(total[1].at).getTime() - new Date(total[0].at).getTime()) / 1000 : win / BUCKETS;
  const perMinute = (b: Bucket[]) => (b.length > 1 ? Math.round((b[b.length - 2].count / span) * 60) : 0);
  const rate = totalCount ? (errorCount / totalCount) * 100 : 0;
  const errorAt = new Map(errors.map((b) => [b.at, b.count]));
  const zone = settings.results.timezone;

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-hidden">
      {/* the scope, in the corner, and whether it is live */}
      <div className="island-editor flex h-10 shrink-0 items-center gap-2 px-3">
        <span className="text-[13px] font-semibold">Monitor</span>
        <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: paused ? "var(--text-muted)" : "var(--green)" }}>
          <span
            className={`size-[7px] rounded-full ${paused ? "" : "animate-pulse"}`}
            style={{ background: paused ? "var(--text-muted)" : "var(--green)" }}
          />
          {paused ? "Paused" : "Live"}
          {live && (
            <span style={{ color: "var(--text-muted)" }}>
              · {live.error ? <span style={{ color: "var(--amber)" }}>{live.error}</span> : `updated ${new Date(live.at).toLocaleTimeString()}`}
            </span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Select
            value={conn.id}
            width={180}
            onChange={(id: string) => setMonitorScope({ connId: id })}
            options={settings.connections.map((c) => ({ value: c.id, label: c.name || c.url, icon: <SourceIcon kind={c.kind} /> }))}
          />
          <Select
            value={streamId ?? ""}
            width={220}
            onChange={(id: string) => setMonitorScope({ connId: conn.id, streamId: id || undefined })}
            options={[
              { value: "", label: "All streams" },
              ...(streams.connId === conn.id ? streams.list : []).map((s) => ({ value: s.id, label: s.title })),
            ]}
          />
          <span className="flex rounded-[5px] p-px" style={{ background: "var(--bg-input)" }}>
            {WINDOWS.map((w) => (
              <button
                key={w.seconds}
                onClick={() => setWin(w.seconds)}
                className="h-[22px] rounded-[4px] px-2 text-[11.5px]"
                style={{
                  background: w.seconds === win ? "var(--bg-active)" : undefined,
                  color: w.seconds === win ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {w.label}
              </button>
            ))}
          </span>
          <button
            onClick={() => setPaused((p) => !p)}
            data-tip={paused ? "Resume" : "Pause"}
            className="flex size-[26px] items-center justify-center rounded hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-dim)" }}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
        </span>
      </div>

      {!live ? (
        <Skeleton
          label={`Reading the last ${WINDOWS.find((w) => w.seconds === win)?.label} of ${streamId ? (titles.get(streamId) ?? "the stream") : "every stream"}`}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-5">
            <Card label="Throughput" value={`${perMinute(total).toLocaleString()}/min`} sub={`${totalCount.toLocaleString()} in the window`}>
              <Spark values={total.map((b) => b.count)} color="var(--accent)" />
            </Card>
            <Card
              label="Failures"
              value={live.errorQuery ? errorCount.toLocaleString() : "—"}
              sub={live.errorQuery ? `${perMinute(errors).toLocaleString()}/min now` : "no level or status to tell them by"}
              tone={errorCount ? "var(--red)" : undefined}
            >
              <Spark values={errors.map((b) => b.count)} color="var(--red)" />
            </Card>
            <Card
              label="Error rate"
              value={live.errorQuery ? `${rate.toFixed(rate < 10 ? 2 : 1)}%` : "—"}
              sub="failures out of all messages"
              tone={rate >= 5 ? "var(--red)" : rate >= 1 ? "var(--amber)" : "var(--green)"}
            >
              <Spark values={total.map((b) => (b.count ? ((errorAt.get(b.at) ?? 0) / b.count) * 100 : 0))} color="var(--amber)" />
            </Card>
            <Card
              label="Latency p95"
              value={d?.p95 != null ? ms(d.p95) : "—"}
              sub={d?.p95 != null ? `p50 ${ms(d.p50 ?? 0)}, over ${d.sampled.toLocaleString()} lines` : "no duration field in the lines"}
              tone={d?.p95 != null && d.p95 >= 1000 ? "var(--amber)" : undefined}
            />
            <Card label="Hosts" value={(d?.sources ?? 0).toLocaleString()} sub={`${d?.streams.length ?? 0} streams speaking`} />
          </div>

          <div className="mt-1.5">
            <Panel title="Traffic and failures" note={`per ${bucketFor(win, BUCKETS)}, exact counts from the source`}>
              <Chart total={total} errorAt={errorAt} zone={zone} />
            </Panel>
          </div>

          <div className="mt-1.5 grid grid-cols-1 gap-1.5 lg:grid-cols-3">
            {!streamId && (
              <Panel title="Busiest streams" note="in the tail">
                <Bars rows={d?.streams ?? []} />
              </Panel>
            )}
            <Panel title="Busiest hosts" note="in the tail">
              <Bars rows={d?.hosts ?? []} />
            </Panel>
            <Panel title="Levels" note="in the tail">
              <Bars rows={d?.levels ?? []} colorOf={levelColor} />
            </Panel>
          </div>

          <div className="mt-1.5 grid grid-cols-1 gap-1.5 lg:grid-cols-2">
            <Panel title="Failures that repeat" note="masked to their template">
              {!d?.failures.length ? (
                <Empty>No failures in the tail.</Empty>
              ) : (
                d.failures.map((p) => (
                  <div key={p.template} className="flex items-center gap-3 py-1 text-[12px]" title={p.sample}>
                    <span className="w-[44px] shrink-0 text-right font-medium tabular-nums" style={{ color: "var(--red)" }}>
                      {p.count}×
                    </span>
                    <span className="truncate font-[var(--font-mono)] text-[11.5px]">{p.template}</span>
                  </div>
                ))
              )}
            </Panel>
            <Panel title="Live tail" note={live.fresh ? `${live.fresh} new in the last look` : "newest first"}>
              <div className="font-[var(--font-mono)] text-[11px]">
                {live.tail.slice(0, 40).map((r, i) => {
                  const failed = isFailure(r);
                  return (
                    <div
                      key={rowKey(r)}
                      className={`flex h-[20px] items-center gap-2 ${i < live.fresh ? "flux-flash" : ""}`}
                      title={String(r.message ?? "")}
                    >
                      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                        {formatTs(new Date(timeOf(r)), zone, "time")}
                      </span>
                      <span
                        className="w-[64px] shrink-0 truncate font-semibold"
                        style={{ color: failed ? "var(--red)" : levelColor(levelOf(r) ?? "") }}
                      >
                        {levelOf(r) ?? ""}
                      </span>
                      {!streamId && (
                        <span className="w-[120px] shrink-0 truncate" style={{ color: "var(--text-dim)" }}>
                          {streamName(r) ?? ""}
                        </span>
                      )}
                      <span className="truncate">{String(r.message ?? "")}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

/** The dashboard's shape while a scope is first read, so switching streams never empties the screen. */
function Skeleton({ label }: { label: string }) {
  const bar = (w: string, h: number) => <span className="flux-shimmer block" style={{ width: w, height: h }} />;
  return (
    <div className="min-h-0 flex-1 overflow-hidden" role="status" aria-label={label}>
      <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="island-editor flex flex-col gap-2 p-3">
            {bar("40%", 10)}
            {bar("60%", 22)}
            {bar("80%", 9)}
            {bar("100%", 24)}
          </div>
        ))}
      </div>
      <div className="island-editor mt-1.5 flex flex-col gap-2 p-3">
        {bar("22%", 11)}
        {bar("100%", 180)}
      </div>
      <div className="mt-1.5 grid grid-cols-1 gap-1.5 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="island-editor flex flex-col gap-2.5 p-3">
            {bar("35%", 11)}
            {[90, 70, 55, 40].map((w) => (
              <span key={w}>{bar(`${w}%`, 8)}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)} s` : `${Math.round(n)} ms`);

function levelColor(level: string): string {
  if (/^(ERROR|CRITICAL|ALERT|EMERGENCY|FATAL|PANIC)$/.test(level)) return "var(--red)";
  if (/^WARN/.test(level)) return "var(--amber)";
  if (/^(INFO|NOTICE)$/.test(level)) return "var(--green)";
  return "var(--text-dim)";
}

function Card({ label, value, sub, tone, children }: { label: string; value: string; sub: string; tone?: string; children?: ReactNode }) {
  return (
    <div className="island-editor flex flex-col p-3">
      <span className="text-[11px] font-medium" style={{ color: "var(--text-dim)" }}>
        {label}
      </span>
      <span className="mt-1 text-[22px] leading-tight font-semibold tabular-nums" style={{ color: tone ?? "var(--text)" }}>
        {value}
      </span>
      <span className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }} title={sub}>
        {sub}
      </span>
      {children && <div className="mt-2 h-[28px]">{children}</div>}
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="island-editor p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold">{title}</span>
        {note && (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {note}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}

/** A line through the values, as wide as its card. */
function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const top = Math.max(1, ...values);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - (v / top) * 26}`).join(" ");
  return (
    <svg width="100%" height="28" viewBox="0 0 100 28" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Messages and failures per bucket, with the time under them and the values on hover. */
function Chart({ total, errorAt, zone }: { total: Bucket[]; errorAt: Map<string, number>; zone: "local" | "utc" }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 180;
  if (total.length < 2) return <Empty>Not enough of the window has been counted yet.</Empty>;
  const top = Math.max(1, ...total.map((b) => b.count));
  const x = (i: number) => (i / (total.length - 1)) * 100;
  const y = (v: number) => H - (v / top) * (H - 8);
  const line = (vals: number[]) => vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const counts = total.map((b) => b.count);
  const fails = total.map((b) => errorAt.get(b.at) ?? 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (total.length - 1)));
  const at = hover != null ? total[hover] : null;
  return (
    <div>
      <div
        className="relative"
        style={{ height: H }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(total.length - 1, Math.round(((e.clientX - r.left) / r.width) * (total.length - 1)))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <svg width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2="100" y1={H * f} y2={H * f} stroke="var(--border-soft)" vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={`0,${H} ${line(counts)} 100,${H}`} fill="color-mix(in srgb, var(--accent) 14%, transparent)" />
          <polyline
            points={line(counts)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          <polyline points={line(fails)} fill="none" stroke="var(--red)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--text-muted)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <span className="absolute top-0 left-0 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
          {top.toLocaleString()}
        </span>
        {at && (
          <div
            className="pointer-events-none absolute top-2 rounded-[6px] px-2 py-1.5 text-[11px] whitespace-nowrap"
            style={{
              left: `${x(hover!)}%`,
              transform: hover! > total.length / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
              background: "var(--bg-tool)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ color: "var(--text-dim)" }}>{formatTs(new Date(at.at), zone, "short")}</div>
            <div style={{ color: "var(--accent)" }}>{at.count.toLocaleString()} messages</div>
            <div style={{ color: "var(--red)" }}>{(errorAt.get(at.at) ?? 0).toLocaleString()} failures</div>
          </div>
        )}
      </div>
      <div className="relative mt-1 h-[14px] text-[10px]" style={{ color: "var(--text-muted)" }}>
        {ticks.map((i) => (
          <span key={i} className="absolute -translate-x-1/2 tabular-nums first:translate-x-0 last:-translate-x-full" style={{ left: `${x(i)}%` }}>
            {formatTs(new Date(total[i].at), zone, "time").slice(0, 5)}
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-4 text-[11px]" style={{ color: "var(--text-dim)" }}>
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-3 rounded" style={{ background: "var(--accent)" }} /> messages
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-3 rounded" style={{ background: "var(--red)" }} /> failures
        </span>
      </div>
    </div>
  );
}

/** A share of the tail as a bar, its failures in red at the end of it. */
function Bars({ rows, colorOf }: { rows: Share[]; colorOf?: (name: string) => string }) {
  if (!rows.length) return <Empty>Nothing in the tail yet.</Empty>;
  const top = Math.max(...rows.map((r) => r.count));
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.name} className="text-[12px]">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate" title={r.name}>
              {r.name}
            </span>
            {r.failed > 0 && (
              <span className="text-[11px] tabular-nums" style={{ color: "var(--red)" }}>
                {r.failed} failed
              </span>
            )}
            <span className="tabular-nums" style={{ color: "var(--text-dim)" }}>
              {r.count.toLocaleString()}
            </span>
          </div>
          <div className="mt-0.5 flex h-[4px] overflow-hidden rounded-full" style={{ background: "var(--border-soft)" }}>
            <span style={{ width: `${((r.count - r.failed) / top) * 100}%`, background: colorOf ? colorOf(r.name) : "var(--accent)" }} />
            <span style={{ width: `${(r.failed / top) * 100}%`, background: "var(--red)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
