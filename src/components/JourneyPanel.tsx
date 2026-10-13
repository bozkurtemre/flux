// The lanes over a traced id's console: one per stream, a dot for every line where it fell in
// time, the failures in red. Clicking a dot selects its row, which is how the story is read:
// see where it broke, then read what it said there.
import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatTs } from "./ResultGrid";
import { journeyOf, position } from "@/lib/journey";
import { useApp, type Tab } from "@/store";

export function JourneyPanel({ tab }: { tab: Tab }) {
  const { patchTab, filterByField, settings, journeyOpen, toggleJourney } = useApp();
  const journey = useMemo(() => (tab.trace && tab.page ? journeyOf(tab.page.rows, tab.trace) : null), [tab.trace, tab.page]);
  // only an explicit "off" hides it: settings read before the option existed have no value for it
  if (!tab.trace || !journey || settings.results.journey === false) return null;
  const zone = settings.results.timezone;
  const errors = journey.lanes.reduce((n, l) => n + l.errors, 0);

  return (
    <div className="flex shrink-0 flex-col gap-1 py-2 pr-3 pl-2 text-[11.5px]" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: "var(--text-dim)" }}>
        <button
          onClick={toggleJourney}
          data-tip={journeyOpen ? "Hide the lanes" : "Show the lanes"}
          className="-mr-1.5 flex size-3.5 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
        >
          {journeyOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <span className="font-[var(--font-mono)] font-medium" style={{ color: "var(--text)" }}>
          {tab.trace}
        </span>
        <span>
          {journey.lanes.length} {journey.lanes.length === 1 ? "stream" : "streams"} · {formatTs(new Date(journey.from), zone, "short")} →{" "}
          {formatTs(new Date(journey.to), zone, "short")}
        </span>
        {errors > 0 && <span style={{ color: "var(--red)" }}>{errors} failed</span>}
        {journey.foundIn.length > 0 && (
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            found in
            {journey.foundIn.slice(0, 6).map((f) => (
              <button
                key={f.field}
                onClick={() => filterByField(tab.id, f.field, tab.trace)}
                data-tip={`Search ${f.field} for it, rather than all the text`}
                className="rounded px-1.5 font-[var(--font-mono)] hover:bg-[var(--bg-hover)]"
                style={{ background: "var(--bg-active)" }}
              >
                {f.field} <span style={{ color: "var(--text-muted)" }}>{f.count}</span>
              </button>
            ))}
          </span>
        )}
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
          over the {tab.page?.rows.length.toLocaleString()} rows on screen
        </span>
      </div>
      {journeyOpen &&
        journey.lanes.map((lane) => (
          <div key={lane.stream} className="flex h-[18px] items-center gap-2 pl-5">
            <span className="w-[160px] shrink-0 truncate" title={lane.stream}>
              {lane.stream}
            </span>
            <span className="w-[64px] shrink-0 text-right tabular-nums" style={{ color: lane.errors ? "var(--red)" : "var(--text-muted)" }}>
              {lane.points.length}
              {lane.errors ? ` · ${lane.errors}✕` : ""}
            </span>
            <div className="relative h-full min-w-0 flex-1">
              <div className="absolute top-1/2 right-0 left-0 h-px" style={{ background: "var(--border)" }} />
              {lane.points.map((p) => (
                <button
                  key={p.index}
                  onClick={() => patchTab(tab.id, { selectedRow: p.index })}
                  data-tip={formatTs(new Date(p.at), zone, "time")}
                  className="absolute top-1/2 size-[8px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${position(p.at, journey.from, journey.to)}%`,
                    background: p.error ? "var(--red)" : "var(--accent)",
                    outline: tab.selectedRow === p.index ? "2px solid var(--text)" : undefined,
                    zIndex: p.error ? 2 : 1,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
