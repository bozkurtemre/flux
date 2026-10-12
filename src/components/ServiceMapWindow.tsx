// The service map: the connection's streams as services, the steps requests take between them as
// edges — thicker for more, red for failing — drawn from a sample of lines that carry an id. The
// bar under it replays the sample: drag it, or press play, and the map is redrawn for each moment,
// so an incident can be watched spreading from one service to the next.
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Radio, RotateCw, Waypoints, X } from "lucide-react";
import { Spinner } from "./icons";
import { Select } from "./settings/controls";
import { formatTs } from "./ResultGrid";
import { isFailure } from "@/lib/journey";
import { buildMap, layout, type MapEdge } from "@/lib/servicemap";
import { useApp } from "@/store";

const W = 1000;
const H = 520;
const NODE = { w: 168, h: 50 };
const RANGES = [
  { value: 900, label: "Last 15 minutes" },
  { value: 3600, label: "Last hour" },
  { value: 21600, label: "Last 6 hours" },
  { value: 86400, label: "Last 24 hours" },
];
/** How much of the sample one frame of the replay shows. */
const FRAME = 1 / 6;
const BINS = 80;

const rate = (bad: number, all: number) => (all ? bad / all : 0);
const tone = (r: number) => (r >= 0.05 ? "var(--red)" : r >= 0.01 ? "var(--amber)" : "var(--text-muted)");
const ms = (v?: number) => (v == null ? "" : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`);

export function ServiceMapWindow() {
  const sample = useApp((s) => s.serviceMap);
  if (!sample) return null;
  return <MapView key={sample.connId} />;
}

function MapView() {
  const { serviceMap: sample, openServiceMap, traceId, openQuery, settings } = useApp();
  const [live, setLive] = useState(false);
  // where the replay stands, from 0 to 1 across the sample; null is the whole of it
  const [at, setAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const close = () => useApp.setState({ serviceMap: null });
  const conn = settings.connections.find((c) => c.id === sample?.connId);

  const times = useMemo(() => (sample?.rows ?? []).map((r) => Date.parse(String(r.timestamp))).filter((t) => !Number.isNaN(t)), [sample?.rows]);
  const span = useMemo(() => (times.length ? { from: Math.min(...times), to: Math.max(...times) } : null), [times]);
  const frame =
    span && at != null
      ? (() => {
          const width = (span.to - span.from) * FRAME;
          const end = span.from + width + at * (span.to - span.from - width);
          return { from: end - width, to: end };
        })()
      : undefined;
  const title = (id: string) => sample?.titles[id] ?? id;
  const map = useMemo(() => buildMap(sample?.rows ?? [], title, frame), [sample?.rows, frame?.from, frame?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const where = useMemo(() => layout(map, W, H), [map]);

  // the strip under the bar: lines per moment, the failing part in red
  const bins = useMemo(() => {
    if (!span) return [];
    const width = Math.max(1, (span.to - span.from) / BINS);
    const out = Array.from({ length: BINS }, () => ({ all: 0, bad: 0 }));
    (sample?.rows ?? []).forEach((r) => {
      const t = Date.parse(String(r.timestamp));
      if (Number.isNaN(t)) return;
      const b = out[Math.min(BINS - 1, Math.floor((t - span.from) / width))];
      b.all++;
      if (isFailure(r)) b.bad++;
    });
    return out;
  }, [sample?.rows, span]);
  const peak = Math.max(1, ...bins.map((b) => b.all));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // live: a fresh sample every quarter of a minute
  useEffect(() => {
    if (!live || !sample) return;
    const tick = setInterval(() => void openServiceMap(sample.connId), 15_000);
    return () => clearInterval(tick);
  }, [live, sample?.connId]); // eslint-disable-line react-hooks/exhaustive-deps

  // play: across the sample in about ten seconds
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const next = (at ?? 0) + (now - last) / 10_000;
      last = now;
      if (next >= 1) {
        setAt(1);
        setPlaying(false);
        return;
      }
      setAt(next);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sample) return null;
  const zone = settings.results.timezone;
  const edgePath = (e: MapEdge) => {
    const a = where.get(e.from);
    const b = where.get(e.to);
    if (!a || !b) return "";
    if (b.x > a.x) {
      const [x1, x2] = [a.x + NODE.w / 2, b.x - NODE.w / 2];
      const mid = (x1 + x2) / 2;
      return `M${x1},${a.y} C${mid},${a.y} ${mid},${b.y} ${x2},${b.y}`;
    }
    // a step back to the left, or within a column: an arc under the boxes
    const dip = Math.max(a.y, b.y) + NODE.h / 2 + 40;
    return `M${a.x},${a.y + NODE.h / 2} C${a.x},${dip} ${b.x},${dip} ${b.x},${b.y + NODE.h / 2}`;
  };
  const label = (e: MapEdge) => {
    const a = where.get(e.from);
    const b = where.get(e.to);
    if (!a || !b) return { x: 0, y: 0 };
    return b.x > a.x ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 8 } : { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + NODE.h / 2 + 34 };
  };

  return (
    <div data-modal className="fixed inset-0 z-[65] flex items-center justify-center" style={{ background: "rgba(0,0,0,.5)" }} onMouseDown={close}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[86vh] w-[1180px] max-w-[96vw] flex-col overflow-hidden rounded-[10px]"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex h-[40px] shrink-0 items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <Waypoints size={15} style={{ color: "var(--accent)" }} />
          <span className="text-[13px] font-semibold">Service map</span>
          <span className="truncate text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {conn?.name || conn?.url} · {map.nodes.length} services · {sample.rows.length.toLocaleString()} lines sampled
            {map.joinedBy ? ` · joined by ${map.joinedBy}` : ""}
          </span>
          {sample.running && <Spinner />}
          <span className="ml-auto flex items-center gap-2">
            <Select value={sample.seconds} onChange={(v) => void openServiceMap(sample.connId, v)} options={RANGES} width={150} />
            <button
              onClick={() => setLive((v) => !v)}
              data-tip={live ? "Stop refreshing" : "Take a fresh sample every 15 seconds"}
              className="flex h-[24px] items-center gap-1 rounded px-2 text-[11.5px]"
              style={{
                background: live ? "color-mix(in srgb, var(--green) 20%, transparent)" : "var(--bg-hover)",
                color: live ? "var(--green)" : "var(--text-dim)",
              }}
            >
              <Radio size={11} /> Live
            </button>
            <button
              onClick={() => void openServiceMap(sample.connId)}
              data-tip="Sample again"
              className="flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
            >
              <RotateCw size={12} />
            </button>
            <button onClick={close} className="flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]">
              <X size={14} />
            </button>
          </span>
        </div>

        <div className="relative min-h-0 flex-1">
          {sample.error && (
            <p className="p-4 text-[12px]" style={{ color: "var(--red)" }}>
              {sample.error}
            </p>
          )}
          {!sample.error && !sample.running && !map.edges.length && (
            <p className="absolute top-3 left-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
              {map.nodes.length
                ? "No request crossed two services in this sample: the services' lines carry no shared request, trace or order id."
                : "No line in this window carries a request, trace or order id."}
            </p>
          )}
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            {map.edges.map((e) => {
              const r = rate(e.errors, e.count);
              const l = label(e);
              return (
                <g
                  key={`${e.from}→${e.to}`}
                  className="cursor-pointer"
                  onClick={() => (close(), void traceId(sample.connId, e.sample, sample.seconds))}
                >
                  <path d={edgePath(e)} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={edgePath(e)}
                    fill="none"
                    stroke={tone(r)}
                    strokeOpacity={r >= 0.01 ? 0.95 : 0.55}
                    strokeWidth={1.5 + Math.log2(1 + e.count)}
                    strokeLinecap="round"
                    style={{ transition: "stroke .25s, stroke-width .25s" }}
                  >
                    <title>{`${title(e.from)} → ${title(e.to)}: ${e.count} requests, ${e.errors} failed, p50 ${ms(e.p50)}, p95 ${ms(e.p95)} — click to trace one`}</title>
                  </path>
                  <text
                    x={l.x}
                    y={l.y}
                    textAnchor="middle"
                    fontSize={11}
                    fill={r >= 0.01 ? tone(r) : "var(--text-dim)"}
                    style={{ pointerEvents: "none" }}
                  >
                    {e.count.toLocaleString()}
                    {e.errors ? ` · ${(r * 100).toFixed(0)}% failed` : ""}
                    {e.p95 != null ? ` · p95 ${ms(e.p95)}` : ""}
                  </text>
                </g>
              );
            })}
            {map.nodes.map((n) => {
              const p = where.get(n.id);
              if (!p) return null;
              const r = rate(n.errors, n.lines);
              return (
                <g
                  key={n.id}
                  className="cursor-pointer"
                  onClick={() => {
                    close();
                    openQuery({ connId: sample.connId, streamId: n.id, query: "", minutes: Math.round(sample.seconds / 60) });
                  }}
                >
                  <title>{`Open ${n.label} in a console`}</title>
                  <rect
                    x={p.x - NODE.w / 2}
                    y={p.y - NODE.h / 2}
                    width={NODE.w}
                    height={NODE.h}
                    rx={10}
                    fill="var(--bg-input)"
                    stroke={r >= 0.01 ? tone(r) : "var(--border)"}
                    strokeWidth={r >= 0.05 ? 2 : 1}
                    style={{ transition: "stroke .25s" }}
                  />
                  <text x={p.x} y={p.y - 4} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--text)">
                    {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
                  </text>
                  <text x={p.x} y={p.y + 13} textAnchor="middle" fontSize={10.5} fill={n.errors ? tone(r) : "var(--text-muted)"}>
                    {n.lines.toLocaleString()} lines{n.errors ? ` · ${n.errors} failed` : ""}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {span && (
          <div className="flex shrink-0 items-center gap-3 px-4 py-2" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => {
                if (at == null || at >= 1) setAt(0);
                setPlaying((v) => !v);
              }}
              data-tip={playing ? "Pause" : "Replay the sample"}
              className="flex size-7 items-center justify-center rounded-full"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <div className="relative min-w-0 flex-1">
              <div className="flex h-[26px] items-end gap-px">
                {bins.map((b, i) => (
                  <div key={i} className="relative flex-1" style={{ height: `${Math.max(2, (b.all / peak) * 100)}%`, background: "var(--bg-hover)" }}>
                    <div
                      className="absolute right-0 bottom-0 left-0"
                      style={{ height: `${(b.bad / Math.max(1, b.all)) * 100}%`, background: "var(--red)" }}
                    />
                  </div>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round((at ?? 1) * 1000)}
                onChange={(e) => {
                  setPlaying(false);
                  setAt(Number(e.target.value) / 1000);
                }}
                className="absolute inset-0 w-full cursor-pointer opacity-0"
              />
              {frame && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 rounded"
                  style={{
                    left: `${((frame.from - span.from) / (span.to - span.from)) * 100}%`,
                    width: `${FRAME * 100}%`,
                    border: "1px solid var(--accent)",
                    background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                  }}
                />
              )}
            </div>
            <span className="w-[150px] shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--text-dim)" }}>
              {frame ? `${formatTs(new Date(frame.from), zone, "time")} – ${formatTs(new Date(frame.to), zone, "time")}` : "the whole sample"}
            </span>
            {frame && (
              <button onClick={() => (setPlaying(false), setAt(null))} className="text-[11px]" style={{ color: "var(--accent)" }}>
                All
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
