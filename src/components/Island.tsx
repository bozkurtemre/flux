// What is going on behind the tab in front, over the title bar: queries still running, consoles
// following new messages, and the saved queries being watched with what their last round
// found. A pill while you are not looking at it, a card when you are, and nothing at all when
// there is nothing going on.
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Pin, PinOff } from "lucide-react";
import { watchEvery } from "@/lib/queries";
import { useApp } from "@/store";

type State = "running" | "following" | "alert" | "watching";

interface Item {
  key: string;
  title: string;
  detail: string;
  state: State;
  /** When it last did something, for the column on the right. */
  at?: number;
  open: () => void;
}

const CHIP: Record<State, { label: string; color: string }> = {
  running: { label: "running", color: "var(--amber)" },
  following: { label: "following", color: "var(--green)" },
  alert: { label: "new matches", color: "var(--red)" },
  watching: { label: "watching", color: "var(--accent)" },
};

/** `4s`, `3m`, `2h` — how long since, or how long for. */
function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export function Island() {
  const { tabs, savedQueries, watchLog, settings, setActive, openSavedQuery } = useApp();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const items: Item[] = [
    ...tabs
      .filter((t) => t.running)
      .map((t) => ({
        key: `run:${t.id}`,
        title: t.title,
        detail: t.query.trim() || "*",
        state: "running" as const,
        at: t.startedAt,
        open: () => setActive(t.id),
      })),
    ...tabs
      .filter((t) => t.follow && !t.running)
      .map((t) => ({
        key: `follow:${t.id}`,
        title: t.title,
        detail: t.tail?.added ? `${t.tail.added} new on the last tick` : "waiting for new messages",
        state: "following" as const,
        open: () => setActive(t.id),
      })),
    ...savedQueries
      .filter((q) => watchEvery(q, settings.advanced.watchSeconds) > 0)
      .map((q) => {
        const last = watchLog[q.id];
        return {
          key: `watch:${q.id}`,
          title: q.name,
          detail: last
            ? last.found
              ? `${last.found.toLocaleString()} new on the last round`
              : "nothing new on the last round"
            : `every ${ago(watchEvery(q, settings.advanced.watchSeconds) * 1000)}`,
          state: (last?.found ? "alert" : "watching") as State,
          at: last?.at,
          open: () => openSavedQuery(q.id),
        };
      }),
  ];

  // the times on the right count, so the clock moves while something is there to count
  useEffect(() => {
    if (!items.length) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [items.length]);

  // a card nobody pinned closes once what it was showing has finished, so the next thing to
  // start arrives as a pill; adjusted while rendering, the way React has state follow a change
  const [empty, setEmpty] = useState(!items.length);
  if (empty !== !items.length) {
    setEmpty(!items.length);
    if (!items.length && !pinned) setOpen(false);
  }

  if (!settings.appearance.island || !items.length) return null;

  const count = (s: State) => items.filter((i) => i.state === s).length;
  const headline = [
    count("alert") && `${count("alert")} with new matches`,
    count("running") && `${count("running")} running`,
    count("following") && `${count("following")} following`,
    count("watching") && `${count("watching")} watching`,
  ]
    .filter(Boolean)
    .join(" · ");
  const lead: State = count("alert") ? "alert" : count("running") ? "running" : count("following") ? "following" : "watching";

  return (
    <div className="pointer-events-none fixed top-[5px] left-1/2 z-[58] -translate-x-1/2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex h-[26px] items-center gap-2 rounded-full px-3 text-[11.5px]"
          style={{ background: "#0b0b0d", border: "1px solid var(--border)", color: "#e8e8ea", boxShadow: "0 6px 20px rgba(0,0,0,.45)" }}
        >
          <span className="size-[7px] animate-pulse rounded-full" style={{ background: CHIP[lead].color }} />
          {headline}
          <ChevronDown size={12} style={{ color: "#9a9aa0" }} />
        </button>
      ) : (
        <div
          className="pointer-events-auto w-[460px] rounded-[18px] p-2.5"
          style={{ background: "#0b0b0d", border: "1px solid var(--border)", color: "#e8e8ea", boxShadow: "0 18px 50px rgba(0,0,0,.6)" }}
        >
          <div className="flex items-center gap-2 px-1.5 pb-2">
            <span className="size-[8px] animate-pulse rounded-full" style={{ background: CHIP[lead].color }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{headline}</div>
              <div className="text-[11px]" style={{ color: "#9a9aa0" }}>
                {items.length} {items.length === 1 ? "thing" : "things"} going on in Flux
              </div>
            </div>
            <button
              onClick={() => setPinned((p) => !p)}
              data-tip={pinned ? "Unpin: close when there is nothing left" : "Pin: stay open"}
              className="flex size-7 items-center justify-center rounded-full hover:bg-white/10"
              style={{ color: pinned ? "var(--accent)" : "#9a9aa0" }}
            >
              {pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex size-7 items-center justify-center rounded-full hover:bg-white/10"
              style={{ color: "#9a9aa0" }}
            >
              <ChevronUp size={14} />
            </button>
          </div>
          <div className="flex max-h-[320px] flex-col gap-1.5 overflow-auto">
            {items.map((i) => (
              <button
                key={i.key}
                onClick={() => {
                  i.open();
                  if (!pinned) setOpen(false);
                }}
                className="flex items-center gap-3 rounded-[12px] px-3 py-2 text-left hover:brightness-125"
                style={{ background: "#16161a", border: "1px solid #232328" }}
              >
                <span className="h-7 w-[3px] shrink-0 rounded-full" style={{ background: CHIP[i.state].color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{i.title}</span>
                  <span className="block truncate font-[var(--font-mono)] text-[11px]" style={{ color: "#9a9aa0" }}>
                    {i.detail}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-medium"
                  style={{ color: CHIP[i.state].color, background: `color-mix(in srgb, ${CHIP[i.state].color} 16%, transparent)` }}
                >
                  {CHIP[i.state].label}
                </span>
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums" style={{ color: "#9a9aa0" }}>
                  {i.at ? ago(now - i.at) : "now"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
