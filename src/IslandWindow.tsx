// The island's own window: transparent, without a frame, over every other app at the top of the
// screen, so that on a notched MacBook it grows out of the camera housing. It holds no state of
// its own — the main window sends the list. The window is the size of the open card and never
// changes, so nothing jumps while the shape morphs; where the shape is not, clicks go through.
import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { cursorPosition, getCurrentWindow, LogicalPosition, LogicalSize, primaryMonitor } from "@tauri-apps/api/window";
import { BellOff, ChevronUp, Pin, PinOff, X } from "lucide-react";
import { ago, CHIP, headline, lead, placement, type IslandItem } from "@/lib/island";

// the pill is wider than the notch, so what it says shows either side of the camera; it grows
// to HOVER when the cursor comes near, and opens to the card on a click
const PILL = 300;
const HOVER = { width: 340, grow: 8 };
const CARD = 480;
/** How near counts as near, past the pill's edge. */
const REACH = 28;
const SPRING = "cubic-bezier(.32,.72,0,1)";
const MORPH = 460;
/** Room under the notch for the card at its tallest: the header and a list of 300px. */
const ROOM = 400;

interface Screen {
  x: number;
  width: number;
  inset: number;
}

export function IslandWindow() {
  const [items, setItems] = useState<IslandItem[]>([]);
  const [open, setOpen] = useState(false);
  const [near, setNear] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const card = useRef<HTMLDivElement>(null);
  const away = useRef(0);
  const through = useRef<boolean | null>(null);

  useEffect(() => {
    const stop = listen<IslandItem[]>("island-state", (e) => setItems(e.payload));
    // and ask for it, in case this window opened after the last one was sent
    void emitTo("main", "island-ready");
    return () => void stop.then((s) => s());
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // where the top of the screen is, and how tall the notch is there
  useEffect(() => {
    void primaryMonitor().then((m) => {
      if (!m) return;
      const at = placement(
        { x: m.position.x, y: m.position.y, width: m.size.width, scale: m.scaleFactor, workTop: m.workArea.position.y },
        { width: 0, height: 0 },
      );
      setScreen({ x: m.position.x / m.scaleFactor, width: m.size.width / m.scaleFactor, inset: at.inset || 32 });
    });
  }, [items.length]);

  useEffect(() => {
    if (!card.current) return;
    const watch = new ResizeObserver(([e]) => setCardHeight(Math.ceil(e.borderBoxSize[0].blockSize)));
    watch.observe(card.current);
    return () => watch.disconnect();
  }, []);

  const fold = () => setOpen(false);
  // the open card takes the focus, so a click anywhere else is heard: it takes the focus away
  const unfold = () => {
    setOpen(true);
    void getCurrentWindow().setFocus();
  };
  useEffect(() => {
    const stop = getCurrentWindow().onFocusChanged(({ payload: focused }) => !focused && !pinned && setOpen(false));
    return () => void stop.then((s) => s());
  }, [pinned]);

  // a card nobody pinned closes once what it was showing has finished
  const [empty, setEmpty] = useState(true);
  if (empty !== !items.length) {
    setEmpty(!items.length);
    if (!items.length && !pinned) setOpen(false);
  }

  const inset = screen?.inset ?? 32;

  // the window: room for the card, centred, flush with the top
  useEffect(() => {
    if (!items.length || !screen) return void invoke("island_present", { visible: false });
    const win = getCurrentWindow();
    void (async () => {
      await win.setSize(new LogicalSize(CARD, inset + ROOM));
      await win.setPosition(new LogicalPosition(Math.round(screen.x + (screen.width - CARD) / 2), 0));
      await invoke("island_present", { visible: true });
    })();
  }, [items.length, screen, inset]);

  // a window of an app in the background hears no hover, so the cursor is asked where it is
  useEffect(() => {
    if (!items.length || !screen) return;
    const poll = setInterval(() => {
      void Promise.all([cursorPosition(), getCurrentWindow().scaleFactor()]).then(([p, scale]) => {
        const x = p.x / scale - (screen.x + screen.width / 2);
        const y = p.y / scale;
        const half = (open ? CARD : PILL) / 2 + REACH;
        const bottom = (open ? inset + cardHeight : inset) + REACH;
        const inside = Math.abs(x) < half && y < bottom;
        setNear(inside);
        // the window covers more than the shape: away from it, the clicks belong to what is under it
        if (through.current !== !inside) {
          through.current = !inside;
          void getCurrentWindow().setIgnoreCursorEvents(!inside);
        }
        // an open card nobody pinned folds back a moment after the cursor leaves it
        if (!open || pinned || inside) return void (away.current = 0);
        if (!away.current) away.current = Date.now();
        else if (Date.now() - away.current > 1200) {
          away.current = 0;
          fold();
        }
      });
    }, 80);
    return () => clearInterval(poll);
  }, [items.length, screen, open, pinned, inset, cardHeight]);

  const go = (key: string) => {
    void invoke("island_open", { key });
    if (!pinned) fold();
  };

  const colour = CHIP[lead(items)].color;
  const width = open ? CARD : near ? HOVER.width : PILL;
  const height = open ? inset + cardHeight : near ? inset + HOVER.grow : inset;
  const radius = open ? 26 : near ? 18 : 14;
  return (
    // black, flush with the top of the screen, so the shape reads as the notch growing
    <div className="relative h-screen w-screen select-none overflow-hidden" style={{ color: "#ececee", fontFamily: "-apple-system, sans-serif" }}>
      <div
        className="absolute top-0 left-1/2 overflow-hidden"
        style={{
          width,
          height,
          transform: "translateX(-50%)",
          background: "#000",
          borderRadius: `0 0 ${radius}px ${radius}px`,
          transition: `width ${MORPH}ms ${SPRING}, height ${MORPH}ms ${SPRING}, border-radius ${MORPH}ms ${SPRING}`,
        }}
      >
        <button
          onClick={unfold}
          title={headline(items)}
          className="absolute inset-x-0 top-0 flex items-center justify-between px-4 text-[12px] font-semibold tabular-nums"
          style={{
            height: near && !open ? inset + HOVER.grow : inset,
            opacity: open ? 0 : 1,
            pointerEvents: open ? "none" : undefined,
            transition: `opacity 160ms, height ${MORPH}ms ${SPRING}`,
          }}
        >
          <span
            className="animate-pulse rounded-full"
            style={{ background: colour, width: near ? 9 : 7, height: near ? 9 : 7, transition: `all ${MORPH}ms ${SPRING}` }}
          />
          <span style={{ color: colour, fontSize: near ? 13 : 12, transition: `font-size ${MORPH}ms ${SPRING}` }}>{items.length}</span>
        </button>
        <div
          ref={card}
          className="absolute left-1/2 px-3 pt-1 pb-3"
          style={{
            top: inset,
            width: CARD,
            opacity: open ? 1 : 0,
            transform: `translateX(-50%) scale(${open ? 1 : 0.9}) translateY(${open ? 0 : -14}px)`,
            transformOrigin: "top center",
            filter: open ? "none" : "blur(6px)",
            pointerEvents: open ? undefined : "none",
            transition: open
              ? `opacity 280ms 120ms, transform ${MORPH}ms ${SPRING}, filter 280ms 120ms`
              : `opacity 140ms, transform 200ms, filter 140ms`,
          }}
        >
          <div className="flex items-center gap-2 px-1 pb-2">
            <span className="size-[8px] animate-pulse rounded-full" style={{ background: colour }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{headline(items)}</div>
              <div className="text-[11px]" style={{ color: "#8e8e93" }}>
                {items.length} {items.length === 1 ? "thing" : "things"} going on in Flux
              </div>
            </div>
            <button
              onClick={() => void emitTo("main", "island-mute")}
              title="Mute for an hour"
              aria-label="Mute for an hour"
              className="flex size-7 items-center justify-center rounded-full hover:bg-white/10"
              style={{ color: "#8e8e93" }}
            >
              <BellOff size={13} />
            </button>
            <button
              onClick={() => setPinned((p) => !p)}
              className="flex size-7 items-center justify-center rounded-full hover:bg-white/10"
              style={{ color: pinned ? "#4b8ef0" : "#8e8e93" }}
            >
              {pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
            <button onClick={fold} className="flex size-7 items-center justify-center rounded-full hover:bg-white/10" style={{ color: "#8e8e93" }}>
              <ChevronUp size={14} />
            </button>
          </div>
          <div className="flex max-h-[300px] flex-col gap-1.5 overflow-auto">
            {items.map((i, n) => (
              <button
                key={i.key}
                onClick={() => go(i.key)}
                className="flex items-center gap-3 rounded-[12px] px-3 py-2 text-left hover:brightness-125"
                style={{
                  background: "#141416",
                  border: "1px solid #232326",
                  opacity: open ? 1 : 0,
                  transform: `translateY(${open ? 0 : -6}px)`,
                  transition: `opacity 260ms ${open ? 160 + n * 40 : 0}ms, transform ${MORPH}ms ${SPRING} ${open ? 160 + n * 40 : 0}ms`,
                }}
              >
                <span className="h-7 w-[3px] shrink-0 rounded-full" style={{ background: CHIP[i.state].color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{i.title}</span>
                  <span className="block truncate font-mono text-[11px]" style={{ color: "#8e8e93" }}>
                    {i.detail}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-medium"
                  style={{ color: CHIP[i.state].color, background: `color-mix(in srgb, ${CHIP[i.state].color} 18%, transparent)` }}
                >
                  {CHIP[i.state].label}
                </span>
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums" style={{ color: "#8e8e93" }}>
                  {i.at ? ago(now - i.at) : i.state === "update" ? "" : "now"}
                </span>
                {i.state === "running" && (
                  // a span, since the row is a button already; the click stays here and Flux stays behind
                  <span
                    role="button"
                    aria-label="Stop the query"
                    title="Stop the query"
                    onClick={(e) => {
                      e.stopPropagation();
                      void emitTo("main", "island-cancel", i.key.slice("run:".length));
                    }}
                    className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
                    style={{ color: "#8e8e93" }}
                  >
                    <X size={12} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
