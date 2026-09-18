// A window typed out rather than chosen from the list: a month of days to drag a range
// across, and a time of day for each end. It is drawn here rather than left to the browser
// because `datetime-local` brings the system's own panel, which belongs to another
// application. What it writes is the `between` clause, which is where a window lives whatever
// wrote it — a drag on the timeline, a row's five minutes, or this.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { atTime, dayKey, fromInput, monthDays, splitInput, toInput, type Zone } from "@/lib/when";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function RangePicker({
  from,
  to,
  zone,
  onApply,
  onClear,
}: {
  /** Both ends as a date field has them: `YYYY-MM-DDTHH:mm:ss`, in `zone`. */
  from: string;
  to: string;
  zone: Zone;
  onApply: (from: Date, to: Date) => void;
  onClear?: () => void;
}) {
  const [start, setStart] = useState(() => splitInput(from));
  const [end, setEnd] = useState(() => splitInput(to));
  const [hover, setHover] = useState<string | null>(null);
  // a click sets the start, the next one the end; the third starts again
  const [half, setHalf] = useState<"start" | "end">("start");
  const [cursor, setCursor] = useState(() => {
    const at = fromInput(from, zone) ?? new Date();
    return { year: at.getFullYear(), month: at.getMonth() };
  });

  const days = monthDays(cursor.year, cursor.month);
  const today = dayKey(new Date());
  const [lo, hi] = start.day <= end.day ? [start.day, end.day] : [end.day, start.day];
  const preview = half === "end" && hover ? (hover < start.day ? [hover, start.day] : [start.day, hover]) : [lo, hi];

  const pick = (day: string) => {
    if (half === "start") {
      setStart({ ...start, day });
      setEnd({ ...end, day });
      setHalf("end");
      return;
    }
    if (day < start.day) setStart({ ...start, day });
    else setEnd({ ...end, day });
    setHalf("start");
  };

  const move = (by: number) => {
    const at = new Date(cursor.year, cursor.month + by, 1);
    setCursor({ year: at.getFullYear(), month: at.getMonth() });
  };

  const apply = () => {
    const a = fromInput(atTime(lo, start.day <= end.day ? start.time : end.time), zone);
    const b = fromInput(atTime(hi, start.day <= end.day ? end.time : start.time), zone);
    if (a && b) onApply(a, b);
  };

  const time = (value: string, set: (v: string) => void) => (
    <input
      type="time"
      step="1"
      value={value}
      onChange={(e) => set(e.target.value.length === 5 ? `${e.target.value}:00` : e.target.value)}
      className="selectable h-[22px] rounded-[4px] px-1 text-center text-[11px] outline-none"
      style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", colorScheme: "inherit" }}
    />
  );

  return (
    <div
      data-modal
      className="absolute top-7 left-0 z-[56] w-[248px] rounded-[8px] p-2.5"
      style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 16px 40px rgba(0,0,0,.55)" }}
    >
      <div className="flex items-center gap-1 pb-1.5">
        <button onClick={() => move(-1)} className="flex size-5 items-center justify-center rounded hover:bg-[var(--bg-hover)]">
          <ChevronLeft size={13} style={{ color: "var(--text-dim)" }} />
        </button>
        <span className="flex-1 text-center text-[12px] font-medium">
          {MONTHS[cursor.month]} {cursor.year}
        </span>
        <button onClick={() => move(1)} className="flex size-5 items-center justify-center rounded hover:bg-[var(--bg-hover)]">
          <ChevronRight size={13} style={{ color: "var(--text-dim)" }} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {d}
          </span>
        ))}
        {days.map((date) => {
          const key = dayKey(date);
          const outside = date.getMonth() !== cursor.month;
          const inRange = key > preview[0] && key < preview[1];
          const edge = key === preview[0] || key === preview[1];
          return (
            <button
              key={key}
              onClick={() => pick(key)}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover(null)}
              className="h-[22px] text-[11px] tabular-nums"
              style={{
                background: edge ? "var(--accent)" : inRange ? "color-mix(in srgb, var(--accent) 22%, transparent)" : undefined,
                color: edge ? "#fff" : outside ? "var(--text-muted)" : "var(--text)",
                borderRadius: edge ? 4 : 0,
                outline: key === today && !edge ? "1px solid var(--border)" : undefined,
                outlineOffset: -3,
              }}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        {time(start.day <= end.day ? start.time : end.time, (v) =>
          start.day <= end.day ? setStart({ ...start, time: v }) : setEnd({ ...end, time: v }),
        )}
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          →
        </span>
        {time(start.day <= end.day ? end.time : start.time, (v) =>
          start.day <= end.day ? setEnd({ ...end, time: v }) : setStart({ ...start, time: v }),
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {zone === "utc" ? "UTC" : "local time"}
        </span>
        {onClear && (
          <button onClick={onClear} className="text-[11px] hover:underline" style={{ color: "var(--text-dim)" }}>
            Clear
          </button>
        )}
        <button onClick={apply} className="ml-auto h-[22px] rounded-[4px] px-2.5 text-[12px]" style={{ background: "var(--accent)", color: "#fff" }}>
          Apply
        </button>
      </div>
    </div>
  );
}

/** What the picker opens on: the window the console has, or the range it is showing. */
export function openingRange(between: { from: string; to: string } | undefined, rangeSeconds: number, zone: Zone) {
  const end = between ? new Date(between.to) : new Date();
  const start = between ? new Date(between.from) : new Date(end.getTime() - rangeSeconds * 1000);
  return { from: toInput(start, zone), to: toInput(end, zone) };
}
