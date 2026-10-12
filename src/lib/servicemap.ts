// Your architecture, drawn from your logs. A request crosses services, and each service writes to
// its own stream with the request's id in it; lining those lines up by id and by time says which
// stream spoke after which. Every such step is an edge, and the edges together are the map — with
// no agent, no tracing library, nothing but what the logs already say.
import { leaf, NAME_LABELS, NAMES } from "./correlation";
import { isFailure } from "./journey";

type Row = Record<string, unknown>;

export interface MapNode {
  id: string;
  label: string;
  lines: number;
  errors: number;
}

export interface MapEdge {
  from: string;
  to: string;
  /** How many requests took this step, and how many failed on its far side. */
  count: number;
  errors: number;
  /** The time between the two services' lines, in milliseconds. */
  p50?: number;
  p95?: number;
  /** An id that took this step — a failed one if there is one — to trace. */
  sample: string;
}

export interface ServiceMap {
  /** The kind of id the services were joined by: request id, order id, … */
  joinedBy: string | null;
  nodes: MapNode[];
  edges: MapEdge[];
  /** The order the nodes are drawn left to right in: how early in a request each one speaks. */
  layers: string[][];
}

/** The ids a row carries, by kind: which of the correlation names it matched. */
function idsOf(row: Row): Map<number, string> {
  const out = new Map<number, string>();
  for (const [key, value] of Object.entries(row)) {
    if (value == null || value === "" || typeof value === "object") continue;
    const kind = NAMES.findIndex((n) => n.test(leaf(key)));
    if (kind >= 0 && !out.has(kind)) out.set(kind, String(value));
  }
  return out;
}

const streamOf = (row: Row) => (Array.isArray(row.streams) ? String(row.streams[0] ?? "") : String(row.streams ?? row.source ?? ""));

function quantile(values: number[], q: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

/**
 * The map of some rows. The id they are joined by is the kind the most streams carry, so a
 * stream with an order id but no request id still joins when that is what most of them share.
 * `title` names a stream for the reader; `window` keeps only the rows inside it, which is how the
 * map is replayed across time without asking the source again.
 */
export function buildMap(rows: Row[], title: (stream: string) => string, window?: { from: number; to: number }): ServiceMap {
  const timed = rows
    .map((row) => ({ row, at: Date.parse(String(row.timestamp)), stream: streamOf(row) }))
    .filter((r) => r.stream && !Number.isNaN(r.at) && (!window || (r.at >= window.from && r.at <= window.to)));

  // which kind of id most streams share
  const streamsWith = new Map<number, Set<string>>();
  const ids = timed.map((r) => idsOf(r.row));
  timed.forEach((r, i) => ids[i].forEach((_, kind) => streamsWith.set(kind, (streamsWith.get(kind) ?? new Set()).add(r.stream))));
  const kind = [...streamsWith].sort((a, b) => b[1].size - a[1].size || a[0] - b[0])[0]?.[0];

  const nodes = new Map<string, MapNode>();
  for (const r of timed) {
    let n = nodes.get(r.stream);
    if (!n) nodes.set(r.stream, (n = { id: r.stream, label: title(r.stream), lines: 0, errors: 0 }));
    n.lines++;
    if (isFailure(r.row)) n.errors++;
  }

  // each id's lines in time order, a stream speaking twice in a row being one step
  const byId = new Map<string, typeof timed>();
  if (kind != null) {
    timed.forEach((r, i) => {
      const id = ids[i].get(kind);
      if (!id) return;
      const list = byId.get(id) ?? [];
      list.push(r);
      byId.set(id, list);
    });
  }
  const edges = new Map<string, MapEdge & { gaps: number[] }>();
  const positions = new Map<string, number[]>();
  for (const [id, list] of byId) {
    list.sort((a, b) => a.at - b.at);
    const steps = list.filter((r, i) => i === 0 || r.stream !== list[i - 1].stream);
    // where each stream first speaks: a callback coming back to it later does not move it right
    const first = new Map<string, number>();
    steps.forEach((s, i) => !first.has(s.stream) && first.set(s.stream, i));
    first.forEach((i, stream) => positions.set(stream, [...(positions.get(stream) ?? []), i]));
    for (let i = 1; i < steps.length; i++) {
      const [a, b] = [steps[i - 1], steps[i]];
      const key = `${a.stream}→${b.stream}`;
      let e = edges.get(key);
      if (!e) edges.set(key, (e = { from: a.stream, to: b.stream, count: 0, errors: 0, gaps: [], sample: id }));
      e.count++;
      e.gaps.push(b.at - a.at);
      // a step fails when anything its far side wrote for this id did
      const failed = list.some((r) => r.stream === b.stream && isFailure(r.row));
      if (failed) {
        if (!e.errors) e.sample = id;
        e.errors++;
      }
    }
  }

  // left to right by how early each stream speaks in a request, on average
  const depth = (s: string) => {
    const p = positions.get(s);
    return p?.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : 0;
  };
  const layers: string[][] = [];
  for (const n of [...nodes.values()].sort((a, b) => b.lines - a.lines)) (layers[depth(n.id)] ??= []).push(n.id);

  return {
    joinedBy: kind != null ? NAME_LABELS[kind] : null,
    nodes: [...nodes.values()],
    edges: [...edges.values()].map(({ gaps, ...e }) => ({ ...e, p50: quantile(gaps, 0.5), p95: quantile(gaps, 0.95) })),
    layers: layers.filter(Boolean),
  };
}

/** Where each node sits: columns by layer, spread evenly down each column. */
export function layout(map: ServiceMap, width: number, height: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const columns = map.layers.length;
  map.layers.forEach((layer, c) => {
    const x = columns === 1 ? width / 2 : 90 + (c * (width - 180)) / (columns - 1);
    layer.forEach((id, r) => out.set(id, { x, y: ((r + 1) * height) / (layer.length + 1) }));
  });
  return out;
}
