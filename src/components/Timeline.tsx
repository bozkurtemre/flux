// When the messages arrived, over the range the console asked for. Dragging across it writes
// the `between` clause into the query, which is how a range is narrowed everywhere else too:
// the bar chart is a way of writing the same line the console would take typed.
import { useRef, useState } from "react";
import { formatTs } from "./ResultGrid";
import { withBetween } from "@/lib/query";
import { useApp, type Tab } from "@/store";

const HEIGHT = 56;

export function Timeline({ tab }: { tab: Tab }) {
  const { patchTab, runQuery, settings } = useApp();
  const host = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const buckets = tab.histogram ?? [];
  if (!buckets.length) return null;

  const peak = Math.max(...buckets.map((b) => b.count), 1);
  const total = buckets.reduce((a, b) => a + b.count, 0);
  /** The bucket under a point, clamped: a drag that leaves the chart still means something. */
  const bucketAt = (clientX: number) => {
    const box = host.current?.getBoundingClientRect();
    if (!box) return 0;
    const at = Math.floor(((clientX - box.left) / box.width) * buckets.length);
    return Math.max(0, Math.min(buckets.length - 1, at));
  };

  /** The span a drag covers, in the instants the query will name. */
  const commit = (from: number, to: number) => {
    const [a, b] = from <= to ? [from, to] : [to, from];
    const start = new Date(buckets[a].at);
    // the last bucket is a bucket wide, so its end is where the next one starts
    const after = buckets[b + 1]?.at;
    const end = after ? new Date(after) : new Date(new Date(buckets[b].at).getTime() + spanOf(buckets));
    patchTab(tab.id, { query: withBetween(tab.query, start, end), offset: 0 });
    void runQuery(tab.id);
  };

  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const from = bucketAt(e.clientX);
    setDrag({ from, to: from });
    const move = (ev: MouseEvent) => setDrag({ from, to: bucketAt(ev.clientX) });
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDrag(null);
      commit(from, bucketAt(ev.clientX));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const selected = (i: number) => drag && i >= Math.min(drag.from, drag.to) && i <= Math.max(drag.from, drag.to);
  const label = (b: { at: string; count: number }) => `${formatTs(new Date(b.at), settings.results.timezone, "time")} · ${b.count.toLocaleString()}`;

  return (
    <div className="shrink-0 px-2 pt-1.5 pb-1" style={{ borderBottom: "1px solid var(--border-soft)" }}>
      <div className="flex items-end gap-2 pb-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span>{total.toLocaleString()} messages</span>
        <span className="ml-auto">drag to narrow the range</span>
      </div>
      <div ref={host} onMouseDown={onDown} className="flex items-end gap-px" style={{ height: HEIGHT, cursor: "crosshair" }}>
        {buckets.map((b, i) => (
          <div
            key={b.at}
            data-tip={label(b)}
            className="flex-1"
            style={{
              height: `${Math.max(2, (b.count / peak) * HEIGHT)}px`,
              minWidth: 2,
              background: "var(--accent)",
              opacity: drag ? (selected(i) ? 1 : 0.35) : 0.75,
              borderRadius: 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** How wide one bucket is, read off the two that follow each other. */
function spanOf(buckets: { at: string }[]): number {
  if (buckets.length < 2) return 60_000;
  return new Date(buckets[1].at).getTime() - new Date(buckets[0].at).getTime();
}
