// The tour, shown once right after signing in, and again from Help: what a first hour with Flux needs,
// played on a drawing of the app rather than told. A cursor moves, clicks and types; each step
// loops until the next is asked for, so it can be watched twice. The drawing is the app at its
// own size — the chrome, icons, spacing, copy and theme colours of the components it shows, laid
// out as a 1280 × 780 window — and every target sits at a fixed spot in it, so the cursor lands
// on what it clicks without measuring anything; the frame is shrunk as a whole to fit the window.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bookmark,
  Bug,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Columns3,
  Download,
  Filter,
  Fingerprint,
  FoldVertical,
  Gauge,
  Link2,
  MoreVertical,
  PanelRight,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCw,
  Save,
  Search,
  SearchCode,
  Server,
  Settings2,
  SlidersHorizontal,
  SquareTerminal,
  Tags,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { Logo } from "./Logo";
import { Chevron, ClaudeIcon, ConnectionIcon, McpIcon, SourceIcon, StreamIcon } from "./icons";

/** Where the cursor goes, whether it clicks there, a shortcut shown instead, how long it stays, and a caption for it. */
type Beat = { at: [number, number]; click?: boolean; keys?: string; hold: number; say?: string };

/** How long the cursor takes to travel; what it clicks changes when it arrives. */
const MOVE = 750;

// The window as App lays it out: a 6px margin, the title bar, a stripe either side, the status
// bar along the bottom, and the tool windows as islands between them, 6px apart.
const W = 1280;
const H = 780;
const PAD = 6;
const TOP = 36;
const MAIN_BOTTOM = H - PAD - 24;
const EXPLORER_X = PAD + 36;
const EXPLORER_W = 300;
const EDITOR_X = EXPLORER_X + EXPLORER_W + 6;
const RIGHT_STRIPE_X = W - PAD - 36;
const QUERIES_X = RIGHT_STRIPE_X - 260;
/** Where the terminal panel starts, when it is open. */
const TERMINAL_Y = 476;

// inside the editor island, from its top: the tab strip, the console, the timeline, the grid
const TABS_H = 45;
const CONSOLE_H = 180;
const TIMELINE_Y = TABS_H + CONSOLE_H + 1;
const CHART_H = 56;
const NUM_W = 52;
const BUCKETS = [5, 6, 5, 7, 6, 8, 6, 9, 22, 31, 27, 12, 8, 7, 9, 6, 5, 7, 6, 8];
/** The buckets an ⌥-drag runs across, in the explain scene. */
const SPIKE = [8, 10];

/** The middle of a bucket, in a timeline whose editor ends at `right`. */
const bucketX = (i: number, right = RIGHT_STRIPE_X) => {
  const bar = (right - EDITOR_X - 16 - (BUCKETS.length - 1)) / BUCKETS.length;
  return Math.round(EDITOR_X + 8 + i * (bar + 1) + bar / 2);
};
const CHART_Y = TOP + TIMELINE_Y + 6 + 15;

// where things are, for the beats
const TREE_Y = TOP + 28 + 26 + 28;
const ADD_CONNECTION: [number, number] = [EXPLORER_X + EXPLORER_W / 2, TREE_Y + 40 + 16 + 8 + 18 + 8 + 12];
const DIALOG = { x: 140, y: 70, w: 1000, h: 640 };
const FORM_X = DIALOG.x + 232 + 16 + 300 + 12 + 162;
const NAME_Y = DIALOG.y + 38 + 32 + 16 + 28 + 16;
const URL_Y = NAME_Y + 95;
const TOKEN_Y = URL_Y + 31;
const OK: [number, number] = [DIALOG.x + DIALOG.w - 16 - 22, DIALOG.y + DIALOG.h - 24];
const STREAM_ROW: [number, number] = [EXPLORER_X + 80, TREE_Y + 24 + 12];
const QUERY_LINE: [number, number] = [EDITOR_X + 140, TOP + TABS_H + 30 + 12];
const NAME_DIALOG = { x: (W - 420) / 2, y: 300, h: 168 };
const BOOKMARK: [number, number] = [RIGHT_STRIPE_X + 18, TOP + 6 + 64 + 14];
const SAVED_ROW: [number, number] = [QUERIES_X + 80, TOP + 28 + 30 + 24];
const MENU = { x: QUERIES_X - 40, y: SAVED_ROW[1] + 6 };
const WATCH_ITEM: [number, number] = [MENU.x + 100, MENU.y + 4 + 3 * 24 + 12];
const BALLOON = { x: W - 12 - 360, y: H - 36 - 110 };
const BALLOON_OPEN: [number, number] = [BALLOON.x + 16 + 16 + 10 + 22, BALLOON.y + 12 + 20 + 24 + 10 + 12];
const TRACE = { x: (W - 520) / 2, y: Math.round(H * 0.14) };
const TRACE_INPUT: [number, number] = [TRACE.x + 200, TRACE.y + 16 + 20 + 12 + 16];
const MCP_BUTTON: [number, number] = [W - PAD - 12 - 11, MAIN_BOTTOM + 12];
const MCP_POPOVER = { right: PAD + 12, bottom: H - MAIN_BOTTOM - 1 + 26 - 2, w: 320 };
const COPY_COMMAND: [number, number] = [W - MCP_POPOVER.right - MCP_POPOVER.w + 12 + 78 + 8 + 50, H - MCP_POPOVER.bottom - 12 - 30 - 12 - 11];
const TERMINAL_AT: [number, number] = [EXPLORER_X + 520, TERMINAL_Y + 32 + 46];

type Chrome = {
  /** The connection, stream and count the status bar names for the tab in front. */
  tab?: { stream: string; rows: string };
  connections?: number;
  /** Which right tool window is open, and which stripe button is pressed. */
  queries?: boolean;
  mcp?: boolean;
  terminal?: boolean;
};

type Scene = {
  title: string;
  text: ReactNode;
  beats: Beat[];
  /** The stripes and status bar, as they are once beat `landed` has happened. */
  chrome: (landed: number) => Chrome;
  /** The islands and whatever is open over them. */
  draw: (landed: number) => ReactNode;
};

const ORDERS = { stream: "orders", rows: "6 rows · 214 ms" };

const SCENES: Scene[] = [
  {
    title: "Connect a source",
    text: (
      <>
        <b>Settings › Connections</b> takes a Graylog URL and token, Elasticsearch through Kibana, or a folder of local log files. The token stays on
        this Mac.
      </>
    ),
    beats: [
      { at: [760, 420], hold: 700 },
      { at: ADD_CONNECTION, click: true, hold: 900, say: "Add a connection" },
      { at: [FORM_X + 140, URL_Y], click: true, hold: 1500, say: "Its URL" },
      { at: [FORM_X + 140, TOKEN_Y], click: true, hold: 1300, say: "A token, kept on this Mac" },
      { at: OK, click: true, hold: 3200, say: "OK, and the streams appear" },
    ],
    chrome: (l) => ({ connections: l >= 4 ? 1 : 0 }),
    draw: (l) => (
      <>
        <Explorer>{l >= 4 ? <Tree fresh /> : <NoConnections />}</Explorer>
        <Editor>
          <Welcome connected={l >= 4} />
        </Editor>
        {l >= 1 && l < 4 && <ConnectionSettings url={l >= 2} token={l >= 3} />}
      </>
    ),
  },
  {
    title: "Search, then keep it",
    text: (
      <>
        Open a stream and type a Lucene query in its console; <b>⌘⏎</b> runs it. <b>⌘S</b> saves it by name, and it waits for you in <b>Queries</b> on
        the right.
      </>
    ),
    beats: [
      { at: [760, 520], hold: 600 },
      { at: STREAM_ROW, click: true, hold: 700, say: "Open a stream" },
      { at: QUERY_LINE, click: true, hold: 1300, say: "Type a Lucene query" },
      { at: QUERY_LINE, keys: "⌘ ⏎", hold: 1300, say: "Run it" },
      { at: [NAME_DIALOG.x + 220, NAME_DIALOG.y + 96], keys: "⌘ S", hold: 1500, say: "Save it by name" },
      { at: [NAME_DIALOG.x + 420 - 16 - 24, NAME_DIALOG.y + NAME_DIALOG.h - 29], click: true, hold: 800 },
      { at: BOOKMARK, click: true, hold: 3000, say: "It waits in Queries" },
    ],
    chrome: (l) => ({ connections: 1, tab: l >= 3 ? ORDERS : undefined, queries: l >= 6 }),
    draw: (l) => (
      <>
        <Explorer>
          <Tree selected={l >= 1 ? "orders" : undefined} />
        </Explorer>
        <Editor right={l >= 6 ? QUERIES_X - 6 : undefined}>
          {l >= 1 ? <Console tab="orders" query={l >= 2 ? "level:ERROR" : ""} typing={l === 2} results={l >= 3} /> : <Welcome connected />}
        </Editor>
        {l >= 6 && <Queries saved={SAVED.slice(0, 1)} fresh />}
        {(l === 4 || l === 5) && <NameDialog typed={l === 4} />}
      </>
    ),
  },
  {
    title: "Ask why a spike is different",
    text: (
      <>
        Drag across a spike in the timeline with <b>⌥</b> held. Flux compares it with the time before and tells you which version, service, host or
        route it comes from.
      </>
    ),
    beats: [
      { at: [760, 560], hold: 600 },
      { at: [bucketX(SPIKE[0]), CHART_Y + 30], keys: "⌥", hold: 500, say: "Hold ⌥ and drag" },
      { at: [bucketX(SPIKE[1]), CHART_Y + 30], hold: 900, say: "across the spike" },
      { at: [EDITOR_X + 360, TOP + TIMELINE_Y + 100 + 70], hold: 4600, say: "What sets it apart" },
    ],
    chrome: () => ({ connections: 1, tab: ORDERS }),
    draw: (l) => (
      <>
        <Explorer>
          <Tree selected="orders" />
        </Explorer>
        <Editor>
          <Console
            tab="orders"
            query="level:ERROR"
            results
            dragging={l === 1 || l === 2 ? (l === 2 ? SPIKE : [SPIKE[0], SPIKE[0]]) : undefined}
            explained={l >= 3}
          />
        </Editor>
      </>
    ),
  },
  {
    title: "One ID, every service",
    text: (
      <>
        <b>⇧⌘I</b> takes a request id, a trace id or a user id and follows it through every stream, in order — the step that failed in red.
      </>
    ),
    beats: [
      { at: [760, 520], hold: 500 },
      { at: [760, 520], keys: "⇧ ⌘ I", hold: 1100, say: "Trace an ID" },
      { at: TRACE_INPUT, keys: "⌘ V", hold: 1300, say: "Paste any id" },
      { at: TRACE_INPUT, keys: "⏎", hold: 600 },
      { at: [EDITOR_X + 600, TOP + TIMELINE_Y + 100 + 44], hold: 4800, say: "Its whole story, in order" },
    ],
    chrome: (l) => ({ connections: 1, tab: l >= 4 ? { stream: "3 streams", rows: "5 rows · 388 ms" } : ORDERS }),
    draw: (l) => (
      <>
        <Explorer>
          <Tree selected="orders" />
        </Explorer>
        <Editor>
          {l >= 4 ? <Console tab={TRACE_ID} query={`"${TRACE_ID}"`} results journey /> : <Console tab="orders" query="level:ERROR" results />}
        </Editor>
        {l >= 1 && l < 4 && <TraceForm typed={l >= 2} />}
      </>
    ),
  },
  {
    title: "Let Flux watch it",
    text: (
      <>
        Right-click a saved query and <b>Watch for new matches</b>: Flux tells you when they arrive, while it is open — or, with{" "}
        <b>Alert when › Nothing arrives</b>, when a cron or a webhook goes quiet.
      </>
    ),
    beats: [
      { at: [700, 520], hold: 600 },
      { at: SAVED_ROW, click: true, hold: 900, say: "Right-click a saved query" },
      { at: WATCH_ITEM, click: true, hold: 900, say: "Watch for new matches" },
      { at: [760, 560], hold: 1500, say: "New matches arrive" },
      { at: BALLOON_OPEN, click: true, hold: 3000, say: "Open them" },
    ],
    chrome: () => ({ connections: 1, tab: ORDERS, queries: true }),
    draw: (l) => (
      <>
        <Explorer>
          <Tree selected="orders" />
        </Explorer>
        <Editor right={QUERIES_X - 6}>
          <Console tab="Payment errors" query="level:ERROR" results fresh={l >= 4} />
        </Editor>
        <Queries saved={SAVED} watching={l >= 2} current={l >= 4} />
        {l === 1 && <WatchMenu />}
        {l === 3 && <Balloon />}
      </>
    ),
  },
  {
    title: "Hand it to Claude Code",
    text: (
      <>
        Flux is an MCP server. Turn it on from the <b>MCP</b> icon in the status bar, paste the one command into a terminal, and Claude Code reads
        your logs with Flux's own tools — searching, counting, opening a query in front of you.
      </>
    ),
    beats: [
      { at: [700, 300], hold: 600 },
      { at: MCP_BUTTON, click: true, hold: 900, say: "MCP, in the status bar" },
      { at: COPY_COMMAND, click: true, hold: 900, say: "Copy the command" },
      { at: TERMINAL_AT, keys: "⌘ V", hold: 1500, say: "Paste it in a terminal" },
      { at: TERMINAL_AT, keys: "⏎", hold: 1900, say: "Ask Claude Code" },
      { at: [EXPLORER_X + 760, TERMINAL_Y + 200], hold: 4200, say: "It reads your logs through Flux" },
    ],
    chrome: (l) => ({ connections: 1, tab: ORDERS, mcp: l >= 1, terminal: l >= 3 }),
    draw: (l) => (
      <>
        <Explorer bottom={l >= 3 ? TERMINAL_Y - 6 : undefined}>
          <Tree selected="orders" />
        </Explorer>
        <Editor bottom={l >= 3 ? TERMINAL_Y - 6 : undefined}>
          <Console tab="orders" query="level:ERROR" results />
        </Editor>
        {l >= 3 && <Terminal step={l} />}
        {(l === 1 || l === 2) && <McpPopover copied={l === 2} />}
      </>
    ),
  },
];

/** How much the drawing is scaled: as large as the window allows, smaller in a small one, so the buttons always show. */
function useScale(): number {
  // what the page needs besides the frame: its padding, the heading and its two lines, the footer, the gaps
  const fit = () => Math.max(0.4, Math.min((innerWidth - 96) / W, (innerHeight - 340) / H, 1));
  const [scale, setScale] = useState(fit);
  useEffect(() => {
    const onResize = () => setScale(fit());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return scale;
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const scale = useScale();
  const last = step === SCENES.length - 1;
  const scene = SCENES[step];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, SCENES.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
      if (e.key === "Escape") onDone();
      // Enter moves on, unless it is pressing a focused button, which already does
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        if (step === SCENES.length - 1) onDone();
        else setStep(step + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone, step]);

  return (
    <div
      className="relative flex h-full flex-col items-center justify-center gap-7 px-8 py-12"
      style={{ background: "var(--bg-window)", color: "var(--text)" }}
    >
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-[38px]" />
      <div className="flex max-w-full items-end justify-between gap-8" style={{ width: W * scale }}>
        <div key={step} className="flux-in max-w-[520px]">
          <p className="text-[12px] font-medium tracking-wide uppercase" style={{ color: "var(--accent)" }}>
            Step {step + 1} of {SCENES.length}
          </p>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight">{scene.title}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            {scene.text}
          </p>
        </div>
        <button onClick={onDone} className="shrink-0 pb-1 text-[12.5px] hover:underline" style={{ color: "var(--text-muted)" }}>
          Skip the tour
        </button>
      </div>

      {/* keyed by step, so a step always starts from its first beat */}
      <Stage key={step} scene={scene} scale={scale} />

      <div className="flex max-w-full items-center justify-between" style={{ width: W * scale }}>
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">
            {SCENES.map((s, i) => (
              <button
                key={s.title}
                onClick={() => setStep(i)}
                aria-label={s.title}
                className="relative h-[6px] overflow-hidden rounded-full transition-all"
                style={{ width: i === step ? 28 : 6, background: i < step ? "var(--accent)" : "var(--border)" }}
              >
                {/* the step on show fills as its scene plays through once */}
                {i === step && (
                  <span
                    key={step}
                    className="flux-fill absolute inset-y-0 left-0"
                    style={{ background: "var(--accent)", animationDuration: `${cycleOf(s)}ms` }}
                  />
                )}
              </button>
            ))}
          </div>
          <span className="hidden items-center gap-1.5 text-[11.5px] sm:flex" style={{ color: "var(--text-muted)" }}>
            <Kbd>←</Kbd>
            <Kbd>→</Kbd> to move <Kbd>↵</Kbd> next <Kbd>esc</Kbd> to skip
          </span>
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex h-[38px] items-center gap-1.5 rounded-[8px] px-4 text-[13px] hover:bg-[var(--bg-hover)]"
              style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}
            >
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <button
            onClick={() => (last ? onDone() : setStep(step + 1))}
            className="flex h-[38px] items-center gap-1.5 rounded-[8px] px-5 text-[13px] font-medium"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            {last ? "Start using Flux" : "Next"} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** How long a scene takes to play through once: the cursor's travel to every beat, and its hold there. */
const cycleOf = (scene: Scene) => scene.beats.reduce((t, b) => t + MOVE + b.hold, 0);

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 font-[var(--font-mono)] text-[10.5px]"
      style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", borderBottomWidth: 2, color: "var(--text-dim)" }}
    >
      {children}
    </kbd>
  );
}

/** One scene, played: the cursor travels to each beat, and what it does there happens on arrival. */
function Stage({ scene, scale }: { scene: Scene; scale: number }) {
  const [beat, setBeat] = useState(0);
  const [landed, setLanded] = useState(0);
  const now = scene.beats[beat];

  useEffect(() => {
    const land = setTimeout(() => setLanded(beat), MOVE);
    const next = setTimeout(() => setBeat((beat + 1) % scene.beats.length), MOVE + now.hold);
    return () => {
      clearTimeout(land);
      clearTimeout(next);
    };
  }, [beat, now.hold, scene.beats.length]);

  const arrived = landed === beat;
  const chrome = scene.chrome(landed);
  return (
    // drawn at the app's own size and shrunk as a whole, so every beat still lands where it points
    <div className="relative max-w-full shrink-0" style={{ width: W * scale, height: H * scale }}>
      <div
        className="relative overflow-hidden rounded-[12px] text-[13px] select-none"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          width: W,
          height: H,
          background: "var(--bg-window)",
          border: "1px solid var(--border)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          color: "var(--text)",
          fontFamily: "var(--font-ui)",
        }}
      >
        <TitleBar />
        <LeftStripe terminal={chrome.terminal} />
        <RightStripe queries={chrome.queries} />
        <StatusBar {...chrome} />
        {scene.draw(landed)}

        {arrived && now.click && (
          <span
            key={beat}
            className="flux-click pointer-events-none absolute z-40 size-[40px] rounded-full"
            style={{
              left: now.at[0] - 20,
              top: now.at[1] - 20,
              border: "2px solid var(--accent)",
              background: "color-mix(in srgb, var(--accent) 18%, transparent)",
            }}
          />
        )}
        {arrived && now.keys && (
          <span
            key={`k${beat}`}
            className="flux-in pointer-events-none absolute z-40 flex gap-1.5"
            style={{ left: now.at[0] + 22, top: now.at[1] - 44 }}
          >
            {now.keys.split(" ").map((k) => (
              <kbd
                key={k}
                className="flex h-[34px] min-w-[34px] items-center justify-center rounded-[8px] px-2 text-[17px] font-medium"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderBottomWidth: 3, color: "var(--text)" }}
              >
                {k}
              </kbd>
            ))}
          </span>
        )}
        {arrived && now.say && (
          // the caption beside the cursor, on whichever side has room
          <span
            key={`s${beat}`}
            className="flux-in pointer-events-none absolute z-40 rounded-[8px] px-3 py-1.5 text-[15px] font-medium whitespace-nowrap"
            style={{
              top: Math.min(now.at[1] + 22, H - 70),
              ...(now.at[0] > W - 300 ? { right: W - now.at[0] + 12 } : { left: now.at[0] + 24 }),
              background: "var(--accent)",
              color: "var(--accent-text)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}
          >
            {now.say}
          </span>
        )}
        <Cursor at={now.at} pressed={arrived && !!now.click} />
      </div>
    </div>
  );
}

function Cursor({ at, pressed }: { at: [number, number]; pressed: boolean }) {
  return (
    <svg
      width="24"
      height="32"
      viewBox="0 0 18 24"
      className="pointer-events-none absolute top-0 left-0 z-50"
      style={{
        transform: `translate(${at[0] - 3}px, ${at[1] - 3}px) scale(${pressed ? 0.88 : 1})`,
        transformOrigin: "3px 3px",
        transition: `transform ${MOVE}ms cubic-bezier(0.45, 0, 0.2, 1)`,
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))",
      }}
    >
      <path d="M2 2 L2 19 L6.5 14.8 L9.6 21.6 L12.4 20.4 L9.4 13.8 L15.4 13.8 Z" fill="#fff" stroke="#000" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Text typing itself, a character at a time; it types once, when it first appears. */
function Typed({ text, ms = 900 }: { text: string; ms?: number }) {
  return (
    <span className="flux-type" style={{ width: `${text.length}ch`, animation: `flux-type ${ms}ms steps(${text.length}) both` }}>
      {text}
    </span>
  );
}

const box = (style: CSSProperties): CSSProperties => ({ position: "absolute", ...style });
const dim = { color: "var(--text-dim)" } as const;
const muted = { color: "var(--text-muted)" } as const;

// ——— the chrome: Shell's title bar, stripes and status bar ———

function TitleBar() {
  const icon = "flex size-7 items-center justify-center rounded-md";
  return (
    <div className="flex h-9 items-center gap-2 pr-1 pl-[78px]" style={box({ left: PAD, right: PAD, top: 0 })}>
      {/* the window's own buttons, where macOS draws them */}
      <span className="absolute top-[12px] left-[8px] flex gap-[8px]">
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} className="size-[12px] rounded-full" style={{ background: c }} />
        ))}
      </span>
      <span className="flex items-center gap-1.5 rounded-md px-1.5 py-1">
        <Logo size={18} radius={40} />
        <span className="text-[13px]">Flux</span>
        <ChevronDown size={12} style={dim} />
      </span>
      <span className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px]" style={dim}>
        Connections
        <ChevronDown size={12} />
      </span>
      <span className="ml-auto flex items-center gap-0.5">
        {[Wrench, Bug, Search, MoreVertical].map((Glyph, i) => (
          <span key={i} className={icon}>
            <Glyph size={15} style={dim} />
          </span>
        ))}
      </span>
    </div>
  );
}

function StripeButton({ children, active, badge }: { children: ReactNode; active?: boolean; badge?: string }) {
  return (
    <span
      className="relative flex size-7 items-center justify-center rounded-md"
      style={{ background: active ? "var(--stripe-active)" : undefined, color: "var(--text-dim)" }}
    >
      {children}
      {badge && (
        <span
          className="absolute -right-[5px] -bottom-[3px] rounded-[3px] px-[2px] text-[6.5px] leading-[9px] font-bold tracking-[0.02em]"
          style={{ background: "var(--accent)", color: "#fff", border: "1px solid var(--bg-window)" }}
        >
          {badge}
        </span>
      )}
    </span>
  );
}

function LeftStripe({ terminal }: { terminal?: boolean }) {
  return (
    <div className="flex w-9 flex-col items-center gap-1 py-1.5" style={box({ left: PAD, top: TOP, bottom: H - MAIN_BOTTOM })}>
      <StripeButton active>
        <Server size={16} />
      </StripeButton>
      <StripeButton badge="BETA">
        <Activity size={16} />
      </StripeButton>
      <div className="flex-1" />
      <StripeButton active={terminal}>
        <SquareTerminal size={16} />
      </StripeButton>
      <StripeButton>
        <Tags size={16} />
      </StripeButton>
      <StripeButton>
        <Gauge size={16} />
      </StripeButton>
    </div>
  );
}

function RightStripe({ queries }: { queries?: boolean }) {
  return (
    <div className="flex w-9 flex-col items-center gap-1 py-1.5" style={box({ left: RIGHT_STRIPE_X, top: TOP, bottom: H - MAIN_BOTTOM })}>
      <StripeButton>
        <Bell size={16} />
      </StripeButton>
      <StripeButton>
        <PanelRight size={16} />
      </StripeButton>
      <StripeButton active={queries}>
        <Bookmark size={16} />
      </StripeButton>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium tracking-wide" style={muted}>
        {label}
      </span>
      <span className="relative h-[4px] w-[28px] overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(4, value)}%`, background: "var(--accent)" }} />
      </span>
      <span className="w-[30px] text-right">{value.toFixed(1)}%</span>
    </span>
  );
}

function StatusBar({ tab, connections = 1, mcp }: Chrome) {
  return (
    <div
      className="flex h-6 items-center gap-3 px-3 text-[11px] whitespace-nowrap"
      style={box({ left: PAD, right: PAD, top: MAIN_BOTTOM, ...muted })}
    >
      {tab ? (
        <>
          <span className="flex items-center gap-1.5">
            <Server size={11} />
            acme
          </span>
          <span>{tab.stream}</span>
          <span>{tab.rows}</span>
        </>
      ) : (
        <span>Ready</span>
      )}
      <span className="ml-auto flex items-center gap-3 tabular-nums">
        <span className="flex items-center gap-2.5">
          <Meter label="CPU" value={0.4} />
          <Meter label="RAM" value={0.3} />
        </span>
        <span>{connections} connections</span>
        <span
          className="flex size-[22px] items-center justify-center rounded"
          style={{ color: mcp ? "var(--green)" : "var(--text-muted)", background: mcp ? "var(--bg-hover)" : undefined }}
        >
          <McpIcon size={16} />
        </span>
      </span>
    </div>
  );
}

// ——— the islands ———

/** Connection Explorer: its header, its toolbar, the filter, and what it holds. */
function Explorer({ children, bottom = MAIN_BOTTOM }: { children: ReactNode; bottom?: number }) {
  const btn = "flex size-[22px] items-center justify-center rounded";
  return (
    <div className="island flex flex-col" style={box({ left: EXPLORER_X, top: TOP, width: EXPLORER_W, height: bottom - TOP })}>
      <div className="flex h-[28px] shrink-0 items-center px-3">
        <span className="text-[12px] font-semibold">Connection Explorer</span>
      </div>
      <div className="flex h-[26px] shrink-0 items-center gap-0.5 px-2">
        <span className={btn}>
          <Plus size={15} style={{ color: "var(--accent)" }} />
        </span>
        <span className={btn}>
          <SearchCode size={14} style={dim} />
        </span>
        <span className="mx-1 h-3.5 w-px" style={{ background: "var(--border)" }} />
        <span className={btn}>
          <RefreshCw size={13} style={dim} />
        </span>
        <span className={btn}>
          <FoldVertical size={14} style={dim} />
        </span>
        <span className="mx-1 h-3.5 w-px" style={{ background: "var(--border)" }} />
        <span className={btn}>
          <SquareTerminal size={14} style={dim} />
        </span>
        <span className={btn}>
          <SlidersHorizontal size={14} style={dim} />
        </span>
      </div>
      <div className="mx-2 mb-1 flex h-[24px] shrink-0 items-center gap-1.5 rounded px-2" style={{ background: "var(--bg-input)" }}>
        <Filter size={11} style={muted} />
        <span className="text-[12px]" style={muted}>
          Filter…
        </span>
      </div>
      {children}
    </div>
  );
}

function NoConnections() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <ConnectionIcon />
      <p className="text-[12px]" style={muted}>
        No connections yet
      </p>
      <span className="rounded px-2 py-1 text-[12px]" style={{ background: "var(--accent)", color: "var(--accent-text)" }}>
        Add a connection
      </span>
    </div>
  );
}

const STREAMS = ["orders", "gateway", "payments", "wallet"];

function TreeRow({
  depth,
  open,
  icon,
  label,
  sub,
  selected,
}: {
  depth: number;
  open?: boolean;
  icon: ReactNode;
  label: string;
  sub?: string;
  selected?: boolean;
}) {
  return (
    <div
      className="flex h-[24px] items-center gap-1.5 pr-2 text-[13px]"
      style={{ paddingLeft: 4 + depth * 14, background: selected ? "var(--sel-focus)" : undefined, color: selected ? "#fff" : undefined }}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Chevron open={!!open} />
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate">{label}</span>
      {sub && (
        <span className="ml-1 truncate text-[11px]" style={muted}>
          {sub}
        </span>
      )}
    </div>
  );
}

/** One Graylog and its streams, as the tree shows them once it has been asked. */
function Tree({ selected, fresh }: { selected?: string; fresh?: boolean }) {
  return (
    <div className={fresh ? "flux-in" : undefined}>
      <TreeRow depth={0} open icon={<ConnectionIcon live />} label="acme" sub="graylog.acme.io" />
      {STREAMS.map((s) => (
        <TreeRow key={s} depth={1} icon={<StreamIcon />} label={s} selected={s === selected} />
      ))}
    </div>
  );
}

/** The editor island, between the explorer and the right stripe or the tool window there. */
function Editor({ children, right = RIGHT_STRIPE_X, bottom = MAIN_BOTTOM }: { children: ReactNode; right?: number; bottom?: number }) {
  return (
    <div className="island-editor flex flex-col" style={box({ left: EDITOR_X, top: TOP, width: right - EDITOR_X, height: bottom - TOP })}>
      {children}
    </div>
  );
}

/** EditorArea's welcome, with no tab open. */
function Welcome({ connected }: { connected?: boolean }) {
  const hints: [string, string][] = [
    ["Search Everywhere", "⇧ ⇧"],
    ["Go to Endpoint", "⇧⌘O"],
    ["Execute Query", "⌘⏎"],
    ["Close Tab", "⌘W"],
    ["Settings", "⌘,"],
  ];
  return (
    <>
      <div className="h-[45px] shrink-0" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-[45px]">
        <Logo size={56} />
        <h1 className="text-[22px] font-light">Welcome to Flux</h1>
        {connected ? (
          <div className="flux-in mt-2 flex flex-col gap-3">
            {hints.map(([label, keys]) => (
              <span key={label} className="flex items-baseline gap-3 text-[15px]" style={muted}>
                {label}
                <span className="text-[14px]" style={dim}>
                  {keys}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <span
            className="mt-2 flex h-[76px] w-[140px] flex-col items-center justify-center gap-2 rounded-lg text-[12px]"
            style={{ background: "var(--bg-tool)", border: "1px solid var(--accent)", ...dim }}
          >
            <span style={{ color: "var(--accent)" }}>＋</span>
            Connection
          </span>
        )}
      </div>
    </>
  );
}

const TRACE_ID = "req_7f3a9c2e";

type Line = [at: string, source: string, level: string, message: string];

const LINES: Line[] = [
  ["2026-10-14 10:42:09", "payments-2", "ERROR", "Payment failed for ord-10531: card declined"],
  ["2026-10-14 10:42:08", "payments-1", "ERROR", "Payment failed for ord-10529: provider timeout"],
  ["2026-10-14 10:41:57", "payments-2", "ERROR", "Refund failed for ord-10488: amount mismatch"],
  ["2026-10-14 10:41:44", "payments-2", "ERROR", "Payment failed for ord-10502: card declined"],
  ["2026-10-14 10:41:30", "payments-1", "ERROR", "Payment failed for ord-10497: 3DS abandoned"],
  ["2026-10-14 10:41:12", "payments-2", "ERROR", "Payment failed for ord-10490: provider timeout"],
];
const FRESH: Line[] = [
  ["2026-10-14 10:42:31", "payments-2", "ERROR", "Payment failed for ord-10544: card declined"],
  ["2026-10-14 10:42:30", "payments-1", "ERROR", "Payment failed for ord-10543: provider timeout"],
  ["2026-10-14 10:42:28", "payments-2", "ERROR", "Payment failed for ord-10541: card declined"],
];
/** One request across three services, oldest first, as a traced id's console has it. */
const STORY: Line[] = [
  ["2026-10-14 10:42:09", "gateway", "INFO", `POST /v1/orders ${TRACE_ID}`],
  ["2026-10-14 10:42:09", "orders", "INFO", `Order ord-10531 created ${TRACE_ID}`],
  ["2026-10-14 10:42:09", "payments", "INFO", `Charging ord-10531 with the card provider ${TRACE_ID}`],
  ["2026-10-14 10:42:17", "payments", "ERROR", `Charge failed: upstream timeout after 8000ms ${TRACE_ID}`],
  ["2026-10-14 10:42:17", "orders", "WARN", `Order ord-10531 left pending ${TRACE_ID}`],
];

/**
 * A console tab as EditorArea draws it: the tab, the toolbar, the query line, and once it has
 * run, the timeline, whatever sits over the grid, the grid and its footer.
 */
function Console({
  tab,
  query,
  typing,
  results,
  fresh,
  dragging,
  explained,
  journey,
}: {
  tab: string;
  query: string;
  typing?: boolean;
  results?: boolean;
  fresh?: boolean;
  /** The buckets an ⌥-drag is across, while it is held. */
  dragging?: number[];
  explained?: boolean;
  journey?: boolean;
}) {
  const btn = "flex size-6 items-center justify-center rounded";
  const lines = journey ? STORY : fresh ? [...FRESH, ...LINES] : LINES;
  return (
    <>
      <div className="flex h-[45px] shrink-0 items-start gap-1 px-1.5 pt-1.5">
        <span className="flex h-[26px] items-center gap-1.5 rounded-md px-2 text-[12px]" style={{ background: "var(--bg-raised)" }}>
          <span className="flex size-3.5 items-center justify-center">
            <StreamIcon />
          </span>
          <span className="font-[var(--font-mono)]">{tab}</span>
        </span>
        <span className="mt-[3px] mr-1 ml-auto flex size-5 items-center justify-center" style={dim}>
          <MoreVertical size={13} />
        </span>
      </div>
      <div className="flex shrink-0 flex-col" style={{ height: CONSOLE_H }}>
        <div className="flex h-[30px] shrink-0 items-center gap-1 px-1.5">
          <span className={btn}>
            <Play size={14} style={{ color: "var(--green)" }} fill="var(--green)" />
          </span>
          <span className={btn}>
            <RotateCw size={13} style={dim} />
          </span>
          <span className={btn}>
            <Save size={13} style={dim} />
          </span>
          <span className={btn}>
            <Radio size={13} style={dim} />
          </span>
          <span className={btn} style={{ opacity: results ? 1 : 0.35 }}>
            <Download size={13} style={dim} />
          </span>
          <span className={btn} style={{ opacity: results ? 1 : 0.35 }}>
            <ClaudeIcon size={13} />
          </span>
          <span className={btn}>
            <Link2 size={13} style={dim} />
          </span>
          <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
          <span
            className="flex h-6 items-center gap-1 rounded px-1.5 text-[12px]"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
          >
            Last {journey ? "7 days" : "1 hour"} <ChevronDown size={11} style={dim} />
          </span>
          <span className={btn}>
            <CalendarClock size={13} style={dim} />
          </span>
          <span className="ml-auto pr-1 text-[11px]" style={muted}>
            | group by field · ⌘⏎ to run
          </span>
        </div>
        <div className="flex font-[var(--font-mono)] text-[13px] leading-[20px]" style={{ background: "var(--bg-editor)" }}>
          <span className="w-[34px] shrink-0 pr-2 text-right" style={{ color: "var(--gutter-text)" }}>
            1
          </span>
          <span className="min-w-0 flex-1 truncate pl-1" style={{ background: "color-mix(in srgb, var(--bg-hover) 50%, transparent)" }}>
            {query ? (
              typing ? (
                <Typed text={query} />
              ) : (
                <Highlighted query={query} />
              )
            ) : (
              <span style={{ color: "var(--syn-comment)" }}>Lucene query, e.g. level_name:ERROR AND httpStatusCode:&gt;=500</span>
            )}
          </span>
        </div>
      </div>
      <div className="h-px shrink-0" style={{ background: "var(--border)" }} />
      {results && (
        <div className="flux-in flex min-h-0 flex-1 flex-col">
          <Timeline count={lines.length * 24 + (fresh ? 3 : 0)} dragging={dragging} quiet={journey} />
          {explained && <Explained />}
          {journey && <Lanes />}
          <Grid lines={lines} fresh={fresh ? FRESH.length : 0} />
        </div>
      )}
    </>
  );
}

/** The console's colours: a field, its colon, a value. */
function Highlighted({ query }: { query: string }) {
  const at = query.indexOf(":");
  if (at < 0) return <span style={{ color: "var(--syn-str)" }}>{query}</span>;
  return (
    <>
      <span style={{ color: "var(--syn-key)" }}>{query.slice(0, at)}</span>
      <span style={{ color: "var(--syn-op)" }}>:</span>
      <span style={{ color: "var(--syn-str)" }}>{query.slice(at + 1)}</span>
    </>
  );
}

function Timeline({ count, dragging, quiet }: { count: number; dragging?: number[]; quiet?: boolean }) {
  const peak = Math.max(...BUCKETS);
  const picked = (i: number) => !!dragging && i >= dragging[0] && i <= dragging[1];
  return (
    <div className="shrink-0 px-2 pt-1.5 pb-1" style={{ borderBottom: "1px solid var(--border-soft)" }}>
      <div className="flex items-center gap-1.5 pb-1 text-[10px] leading-[15px]" style={muted}>
        <ChevronDown size={11} />
        <span>{count.toLocaleString()} messages</span>
        {!quiet && <span style={{ color: "var(--red)" }}>— errors up to 4.2%</span>}
        <span className="ml-auto">drag to narrow the range · ⌥-drag to explain a spike</span>
      </div>
      <div className="relative flex items-end gap-px" style={{ height: CHART_H }}>
        {BUCKETS.map((c, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              height: Math.max(2, ((quiet ? (i === 9 ? 5 : i > 8 && i < 12 ? 2 : 0) : c) / (quiet ? 5 : peak)) * CHART_H),
              minWidth: 2,
              background: dragging && picked(i) ? "var(--purple)" : "var(--accent)",
              opacity: dragging ? (picked(i) ? 1 : 0.35) : 0.75,
              borderRadius: 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** ExplainPanel, over the grid, with what the stretch holds far more of than the time before it. */
function Explained() {
  const rows: [string, string, number, number][] = [
    ["version", "v2.4.1", 0.92, 0.08],
    ["source", "payments-2", 0.88, 0.31],
    ["route", "POST /v1/charges", 0.79, 0.4],
  ];
  const share = (v: number, colour: string) => (
    <span className="flex w-[118px] shrink-0 items-center gap-1.5">
      <span className="h-[6px] flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
        <span className="block h-full rounded-full" style={{ width: `${v * 100}%`, background: colour }} />
      </span>
      <span className="w-[38px] text-right tabular-nums">{Math.round(v * 100)}%</span>
    </span>
  );
  return (
    <div className="flux-in flex shrink-0 flex-col" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex h-[26px] shrink-0 items-center gap-2 px-2 text-[11px]" style={{ background: "var(--bg-tool)", ...dim }}>
        <span className="font-medium" style={{ color: "var(--purple)" }}>
          explain
        </span>
        <span className="truncate">10:41:00.000 – 10:43:00.000 against the three times as long before it, over 6 fields</span>
        <span className="ml-auto flex size-5 items-center justify-center">
          <X size={12} />
        </span>
      </div>
      <div className="text-[12px]">
        <div className="flex h-[22px] items-center gap-3 px-3 text-[10.5px]" style={muted}>
          <span className="w-[150px] shrink-0">field</span>
          <span className="min-w-0 flex-1">value</span>
          <span className="w-[118px] shrink-0">in the stretch</span>
          <span className="w-[118px] shrink-0">before it</span>
        </div>
        {rows.map(([field, value, inside, before], i) => (
          <div key={field} className="flux-in flex h-[24px] items-center gap-3 px-3" style={{ animationDelay: `${150 + i * 160}ms` }}>
            <span className="w-[150px] shrink-0 truncate font-[var(--font-mono)]" style={dim}>
              {field}
            </span>
            <span className="min-w-0 flex-1 truncate font-[var(--font-mono)]">{value}</span>
            {share(inside, "var(--purple)")}
            {share(before, "var(--text-muted)")}
          </div>
        ))}
      </div>
    </div>
  );
}

/** JourneyPanel: a lane per stream, a dot where each line fell, the failure in red. */
function Lanes() {
  const lanes: [string, number[], number?][] = [
    ["gateway", [4]],
    ["orders", [10, 96]],
    ["payments", [36], 94],
  ];
  return (
    <div className="flex shrink-0 flex-col gap-1 py-2 pr-3 pl-2 text-[11.5px]" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-x-3" style={dim}>
        <ChevronDown size={11} className="-mr-1.5" />
        <span className="font-[var(--font-mono)] font-medium" style={{ color: "var(--text)" }}>
          {TRACE_ID}
        </span>
        <span>3 streams · 2026-10-14 10:42:09 → 2026-10-14 10:42:17</span>
        <span style={{ color: "var(--red)" }}>1 failed</span>
        <span className="flex items-center gap-1">
          found in
          <span className="rounded px-1.5 font-[var(--font-mono)]" style={{ background: "var(--bg-active)" }}>
            request_id <span style={muted}>5</span>
          </span>
        </span>
        <span className="ml-auto" style={muted}>
          over the 5 rows on screen
        </span>
      </div>
      {lanes.map(([stream, points, failed], n) => (
        <div key={stream} className="flux-in flex h-[18px] items-center gap-2 pl-5" style={{ animationDelay: `${n * 200}ms` }}>
          <span className="w-[160px] shrink-0 truncate">{stream}</span>
          <span className="w-[64px] shrink-0 text-right tabular-nums" style={{ color: failed ? "var(--red)" : "var(--text-muted)" }}>
            {points.length + (failed ? 1 : 0)}
            {failed ? " · 1✕" : ""}
          </span>
          <div className="relative h-full min-w-0 flex-1">
            <div className="absolute top-1/2 right-0 left-0 h-px" style={{ background: "var(--border)" }} />
            {[...points, ...(failed ? [failed] : [])].map((p) => (
              <span
                key={p}
                className="absolute top-1/2 size-[8px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${p}%`, background: p === failed ? "var(--red)" : "var(--accent)" }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const COLUMNS: [string, number | undefined][] = [
  ["timestamp", 170],
  ["source", 120],
  ["level", 80],
  ["message", undefined],
];

/** ResultGrid: the gutter, the headers, striped one-line rows, the levels in their colours, the footer. */
function Grid({ lines, fresh }: { lines: Line[]; fresh: number }) {
  const tone = (level: string) => (level === "ERROR" ? "var(--red)" : level === "WARN" ? "var(--amber)" : "var(--text-dim)");
  const cell = "shrink-0 truncate px-2 font-[var(--font-mono)] text-[12px] leading-[24px]";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-[26px]" style={{ background: "var(--bg-tool)" }}>
          <div className="shrink-0" style={{ width: NUM_W, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }} />
          {COLUMNS.map(([c, w]) => (
            <div
              key={c}
              className="flex items-center px-2 text-[11px] font-medium"
              style={{ width: w, flex: w ? undefined : 1, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", ...dim }}
            >
              {c}
            </div>
          ))}
        </div>
        {lines.map(([at, source, level, message], i) => (
          <div
            key={`${at}${message}`}
            className={`flex h-[24px] ${i < fresh ? "flux-in" : ""}`}
            style={{
              background: i < fresh ? "color-mix(in srgb, var(--green) 14%, transparent)" : i % 2 ? "var(--row-alt)" : undefined,
            }}
          >
            <div
              className="shrink-0 px-2 text-right font-[var(--font-mono)] text-[11px] leading-[24px] tabular-nums"
              style={{ width: NUM_W, background: "var(--bg-tool)", borderRight: "1px solid var(--border)", ...muted }}
            >
              {i + 1}
            </div>
            <div className={cell} style={{ width: 170, borderRight: "1px solid var(--border-soft)" }}>
              {at}
            </div>
            <div className={cell} style={{ width: 120, borderRight: "1px solid var(--border-soft)" }}>
              {source}
            </div>
            <div className={cell} style={{ width: 80, borderRight: "1px solid var(--border-soft)", color: tone(level) }}>
              {level}
            </div>
            <div className={`${cell} min-w-0 flex-1`}>{message}</div>
          </div>
        ))}
      </div>
      <div className="flex h-[26px] shrink-0 items-center gap-3 px-2 text-[11px]" style={{ borderTop: "1px solid var(--border)", ...muted }}>
        <span className="px-1.5">Reload</span>
        <span className="px-1.5">{lines.length} rows</span>
        <span className="flex items-center gap-0.5">
          <ChevronLeft size={13} className="opacity-35" />
          <span className="min-w-[72px] text-center tabular-nums">1–{lines.length}</span>
          <ChevronRight size={13} className="opacity-35" />
        </span>
        <span>total {lines.length}</span>
        <span>214 ms</span>
        <span className="ml-auto flex items-center gap-1 px-1.5">
          <Columns3 size={12} /> Columns
        </span>
      </div>
    </div>
  );
}

const SAVED = [
  { name: "Payment errors", query: "level:ERROR", stream: "orders" },
  { name: "Slow checkouts", query: "route:checkout AND took_ms:>2000", stream: "gateway" },
];

/** SavedQueries, docked on the right. */
function Queries({ saved, fresh, watching, current }: { saved: typeof SAVED; fresh?: boolean; watching?: boolean; current?: boolean }) {
  return (
    <div className="island flex flex-col" style={box({ left: QUERIES_X, top: TOP, width: RIGHT_STRIPE_X - QUERIES_X, height: MAIN_BOTTOM - TOP })}>
      <div className="flex h-[28px] shrink-0 items-center gap-1 pr-1.5 pl-3">
        <span className="mr-auto text-[12px] font-semibold">Queries</span>
        <span className="h-[18px] rounded px-1.5 text-[11px] leading-[18px] font-medium" style={{ background: "var(--bg-active)" }}>
          Saved
        </span>
        <span className="h-[18px] rounded px-1.5 text-[11px] leading-[18px] font-medium" style={dim}>
          History
        </span>
      </div>
      <div className="mx-2 mt-1 mb-1 flex h-[24px] shrink-0 items-center gap-1.5 rounded px-2" style={{ background: "var(--bg-input)" }}>
        <Filter size={11} style={muted} />
        <span className="text-[12px]" style={muted}>
          Filter…
        </span>
      </div>
      {saved.map((q, i) => (
        <div
          key={q.name}
          className={`flex flex-col gap-0.5 px-2 py-1.5 ${fresh ? "flux-in flux-flash" : ""}`}
          style={{ background: current && i === 0 ? "var(--bg-active)" : undefined }}
        >
          <div className="flex items-center gap-1.5">
            {watching && i === 0 && (
              <span className="flux-in flex items-center gap-0.5 text-[10px] tabular-nums" style={{ color: "var(--amber)" }}>
                <TriangleAlert size={10} />
                1m
              </span>
            )}
            <span className="truncate text-[12px]">{q.name}</span>
          </div>
          <span className="truncate font-[var(--font-mono)] text-[11px]" style={muted}>
            {q.query}
          </span>
          <span className="truncate text-[10px]" style={muted}>
            {q.stream}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The saved query's context menu, as ContextMenu draws it. */
function WatchMenu() {
  const items: [ReactNode, string][] = [
    [<SquareTerminal size={12} />, "Open"],
    [<ClipboardCopy size={12} />, "Copy query"],
    [<Pencil size={12} />, "Rename…"],
    [<Bell size={12} />, "Watch for new matches"],
  ];
  return (
    <div
      className="flux-in z-30 min-w-[220px] overflow-hidden rounded-[6px] py-1"
      style={box({
        left: MENU.x,
        top: MENU.y,
        background: "var(--bg-tool)",
        border: "1px solid var(--border)",
        boxShadow: "0 12px 32px rgba(0,0,0,.5)",
      })}
    >
      {items.map(([icon, label], i) => (
        <div
          key={label}
          className="mx-1 flex h-[24px] items-center gap-2 rounded px-2.5 text-[13px]"
          style={i === 3 ? { background: "var(--sel-focus)", color: "#fff" } : undefined}
        >
          <span className="flex size-4 items-center justify-center">{icon}</span>
          {label}
        </div>
      ))}
    </div>
  );
}

/** A watch's notice, in the corner above the status bar the balloons use. */
function Balloon() {
  return (
    <div
      className="flux-in z-30 rounded-[10px] px-4 py-3"
      style={box({
        left: BALLOON.x,
        top: BALLOON.y,
        width: 360,
        background: "var(--bg-tool)",
        border: "1px solid var(--border)",
        boxShadow: "0 14px 40px rgba(0,0,0,.55)",
      })}
    >
      <div className="flex gap-2.5">
        <TriangleAlert size={16} style={{ color: "var(--amber)" }} className="mt-px shrink-0" />
        <div className="min-w-0">
          <p className="truncate pr-5 text-[13px] font-semibold">Payment errors</p>
          <p className="mt-0.5 text-[13px]" style={dim}>
            3 new matches on orders
          </p>
          <div className="mt-2.5 flex gap-2">
            <span
              className="flex h-[24px] items-center rounded-[4px] px-2.5 text-[12px]"
              style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "var(--accent-text)" }}
            >
              Open
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A modal's dimmed backdrop, over the whole window as the app's are. */
const Backdrop = () => <div className="flux-in z-20" style={box({ inset: 0, background: "rgba(0,0,0,.45)" })} />;

/** ConfirmDialog with its name field: what ⌘S asks the first time a query is kept. */
function NameDialog({ typed }: { typed: boolean }) {
  const button = "h-[26px] rounded-[4px] px-3 text-[13px] leading-[24px]";
  return (
    <>
      <Backdrop />
      <div
        className="flux-in z-30 rounded-[10px] p-4"
        style={box({
          left: NAME_DIALOG.x,
          top: NAME_DIALOG.y,
          width: 420,
          background: "var(--bg-tool)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,.55)",
        })}
      >
        <p className="text-[13px] font-semibold">Save query</p>
        <p className="mt-1.5 text-[13px]" style={dim}>
          It is kept with this workspace, on orders.
        </p>
        <div
          className="mt-3 flex h-[26px] items-center rounded-[4px] px-2 text-[13px]"
          style={{ background: "var(--bg-input)", border: "1px solid var(--accent)" }}
        >
          {typed ? <Typed text="Payment errors" ms={700} /> : "Payment errors"}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <span className={button} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
            Cancel
          </span>
          <span className={button} style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "var(--accent-text)" }}>
            Save
          </span>
        </div>
      </div>
    </>
  );
}

/** TraceDialog: one field for any id, the range, and Trace. */
function TraceForm({ typed }: { typed: boolean }) {
  return (
    <>
      <Backdrop />
      <div
        className="flux-in z-30 flex flex-col gap-3 rounded-[10px] p-4"
        style={box({
          left: TRACE.x,
          top: TRACE.y,
          width: 520,
          background: "var(--bg-tool)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,.55)",
        })}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Fingerprint size={15} style={{ color: "var(--accent)" }} /> Trace an ID across every stream
        </div>
        <div
          className="flex h-[32px] items-center rounded-[5px] px-2.5 font-[var(--font-mono)] text-[13px]"
          style={{ background: "var(--bg-input)", border: "1px solid var(--accent)" }}
        >
          {typed ? <Typed text={TRACE_ID} ms={500} /> : <span style={muted}>Request id, trace id, order id, user id, e-mail…</span>}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex h-[26px] w-[150px] items-center justify-between rounded-[4px] px-2 text-[13px]"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}
          >
            Last 7 days <ChevronDown size={12} style={dim} />
          </span>
          <span
            className="ml-auto flex h-[28px] items-center rounded-[5px] px-3 text-[12.5px]"
            style={{ background: "var(--accent)", color: "var(--accent-text)", opacity: typed ? 1 : 0.4 }}
          >
            Trace
          </span>
        </div>
        <p className="text-[11px]" style={muted}>
          Searched as text in every stream, oldest first. The lanes over the results show which service said what, and when it failed.
        </p>
      </div>
    </>
  );
}

/** Settings, open on Connections with a Graylog being filled in. */
function ConnectionSettings({ url, token }: { url: boolean; token: boolean }) {
  const pages: [string, string?][] = [
    ["Account"],
    ["Appearance & Behavior", "parent"],
    ["Appearance", "child"],
    ["Connection Explorer", "child"],
    ["Keymap"],
    ["Editor", "parent"],
    ["Query Console", "child"],
    ["Results Grid", "child"],
    ["Terminal"],
    ["Projects"],
    ["Updates"],
    ["MCP Server"],
    ["Workspace"],
    ["Connections"],
    ["Jira"],
    ["Advanced Settings"],
  ];
  const button = "h-[26px] rounded-[4px] px-3 text-[13px] leading-[24px]";
  const outline = { background: "var(--bg-raised)", border: "1px solid var(--border)" };
  const row = (label: string, field: ReactNode, hint?: string) => (
    <div className="flex items-start gap-3 py-[3px]">
      <span className="w-[150px] shrink-0 pt-[3px] text-right text-[13px]">{label}</span>
      <div className="min-w-0 flex-1">
        {field}
        {hint && (
          <p className="mt-0.5 text-[11px] leading-snug" style={muted}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
  const input = (value: ReactNode, mono?: boolean, focused?: boolean) => (
    <div
      className={`flex h-[26px] w-full items-center overflow-hidden rounded-[4px] px-2 text-[13px] ${mono ? "font-[var(--font-mono)]" : ""}`}
      style={{ background: "var(--bg-input)", border: `1px solid ${focused ? "var(--accent)" : "var(--border)"}` }}
    >
      {value}
    </div>
  );
  return (
    <>
      <Backdrop />
      <div
        className="flux-in z-30 flex flex-col overflow-hidden rounded-[10px]"
        style={box({
          left: DIALOG.x,
          top: DIALOG.y,
          width: DIALOG.w,
          height: DIALOG.h,
          background: "var(--bg-tool)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,.55)",
        })}
      >
        <div className="flex h-[38px] shrink-0 items-center px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[13px] font-semibold">Settings</span>
          <X size={14} className="ml-auto" />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-[232px] shrink-0 flex-col" style={{ borderRight: "1px solid var(--border)" }}>
            <div className="p-2">
              <div
                className="flex h-[26px] items-center gap-1.5 rounded-[4px] px-2"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}
              >
                <Search size={12} style={muted} />
                <span className="text-[12px]" style={muted}>
                  Search settings
                </span>
              </div>
            </div>
            {pages.map(([label, kind]) =>
              kind === "parent" ? (
                <div key={label} className="flex h-[24px] items-center gap-1 pr-2 pl-3 text-[13px]">
                  <ChevronRight size={11} style={{ ...dim, transform: "rotate(90deg)" }} />
                  {label}
                </div>
              ) : (
                <div
                  key={label}
                  className="mx-1 flex h-[24px] items-center rounded text-[13px]"
                  style={{
                    paddingLeft: kind === "child" ? 26 : 10,
                    background: label === "Connections" ? "var(--sel-focus)" : undefined,
                    color: label === "Connections" ? "#fff" : undefined,
                  }}
                >
                  {label}
                </div>
              ),
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex h-[32px] shrink-0 items-center px-4 text-[12px]" style={{ borderBottom: "1px solid var(--border)" }}>
              Connections
            </div>
            <div className="flex min-h-0 flex-1 gap-3 p-4">
              <div className="flex w-[300px] shrink-0 flex-col rounded-[4px]" style={{ border: "1px solid var(--border)" }}>
                <div className="flex-1 py-1">
                  <div
                    className="mx-1 flex h-[24px] items-center gap-2 rounded px-2 text-[13px]"
                    style={{ background: "var(--sel-focus)", color: "#fff" }}
                  >
                    <SourceIcon kind="graylog" />
                    acme
                    <span className="ml-auto text-[10px]">Graylog</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 p-1.5" style={{ borderTop: "1px solid var(--border)" }}>
                  {(["graylog", "kibana", "local"] as const).map((k) => (
                    <span key={k} className={`${button} flex items-center gap-1`} style={outline}>
                      ＋ <SourceIcon kind={k} />
                    </span>
                  ))}
                  <span className="ml-auto px-1 text-[11px]" style={{ color: "var(--accent)" }}>
                    Import
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[13px] font-semibold">Connection</span>
                  <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                </div>
                <div className="pl-1">
                  {row("Name", input("acme"))}
                  {row(
                    "Source",
                    <div
                      className="flex h-[26px] w-[200px] items-center gap-2 rounded-[4px] px-2 text-[13px]"
                      style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}
                    >
                      <SourceIcon kind="graylog" size={14} /> Graylog
                      <ChevronDown size={12} className="ml-auto" style={dim} />
                    </div>,
                    "Which kind of server the logs come from. Queries are Lucene on both.",
                  )}
                  {row(
                    "Graylog URL",
                    input(
                      url ? <Typed text="https://graylog.acme.io" /> : <span style={muted}>https://graylog.example.com</span>,
                      true,
                      url && !token,
                    ),
                  )}
                  {row(
                    "Access token",
                    input(token ? <Typed text="••••••••••••••••••••" ms={700} /> : null, true, token),
                    "Graylog profile › Edit tokens. Kept in this Mac's keychain, never in an export.",
                  )}
                </div>
                <div className="mt-5 flex items-center gap-2 pl-[162px]">
                  <span className={button} style={outline}>
                    Test
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex h-[48px] shrink-0 items-center gap-2 px-4" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="text-[11px]" style={muted}>
            Unsaved changes
          </span>
          <div className="ml-auto flex gap-2">
            <span className={button} style={outline}>
              Cancel
            </span>
            <span className={button} style={outline}>
              Apply
            </span>
            <span className={button} style={{ background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" }}>
              OK
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/** The status bar's MCP popover, as Shell draws it: on, where, and the configuration to copy. */
function McpPopover({ copied }: { copied: boolean }) {
  const button = "h-[22px] rounded-[4px] px-2 text-[11px] leading-[20px]";
  const outline = { background: "var(--bg-raised)", border: "1px solid var(--border)" };
  return (
    <div
      className="flux-in z-30 w-[320px] rounded-[10px] p-3"
      style={box({
        right: MCP_POPOVER.right,
        bottom: MCP_POPOVER.bottom,
        background: "var(--bg-tool)",
        border: "1px solid var(--border)",
        boxShadow: "0 18px 48px rgba(0,0,0,.55)",
      })}
    >
      <div className="flex items-center">
        <span className="text-[13px] font-semibold">MCP Server</span>
        <Settings2 size={12} className="ml-auto" style={dim} />
      </div>
      <label className="mt-2 flex items-center gap-2 text-[12px]">
        <span className="flex size-[13px] items-center justify-center rounded-[3px] text-[10px] text-white" style={{ background: "var(--accent)" }}>
          ✓
        </span>
        Enable MCP Server
      </label>
      <p className="mt-2 font-[var(--font-mono)] text-[11px]" style={{ color: "var(--accent)" }}>
        http://127.0.0.1:4319/mcp
      </p>
      <p className="mt-3 text-[11px]" style={dim}>
        Manual client configuration
      </p>
      <div className="mt-1.5 flex gap-2">
        <span className={button} style={outline}>
          Copy JSON
        </span>
        <span className={button} style={copied ? { ...outline, color: "var(--green)" } : outline}>
          {copied ? "Copied" : "Copy command"}
        </span>
      </div>
      <p className="mt-3 text-[11px]" style={muted}>
        Reads connections, streams, searches and endpoints, and saves queries to watch. Never writes to a source; tokens are never part of an answer.
      </p>
    </div>
  );
}

/** TerminalPanel, open under the editor: Claude Code added, asked, and reading the logs through Flux. */
function Terminal({ step }: { step: number }) {
  const prompt = <span style={{ color: "var(--green)" }}>~/acme %</span>;
  const command = 'claude mcp add --transport http flux http://127.0.0.1:4319/mcp --header "Authorization: Bearer …"';
  return (
    <div
      className="island flux-in flex flex-col"
      style={box({ left: EXPLORER_X, top: TERMINAL_Y, width: RIGHT_STRIPE_X - EXPLORER_X, height: MAIN_BOTTOM - TERMINAL_Y })}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b px-1.5" style={{ borderColor: "var(--border-soft)" }}>
        <span className="flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px]" style={{ background: "var(--bg-active)" }}>
          acme
        </span>
        <span className="flex size-6 items-center justify-center" style={dim}>
          <Plus size={13} />
        </span>
      </div>
      <div
        className="m-1.5 mt-0 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden rounded-[6px] p-2 font-[var(--font-mono)] text-[12px] leading-[18px] whitespace-pre-wrap"
        style={{ background: "var(--bg-editor)", ...dim }}
      >
        <span>
          {prompt} <span style={{ color: "var(--text)" }}>{step === 3 ? <Typed text={command} ms={1000} /> : command}</span>
        </span>
        {step >= 4 && (
          <>
            <span className="flux-in">Added HTTP MCP server flux with URL: http://127.0.0.1:4319/mcp to local config</span>
            <span className="flux-in">
              {prompt} <span style={{ color: "var(--text)" }}>claude</span>
            </span>
            <span
              className="flux-in mt-1 flex w-fit items-center gap-2 rounded-[6px] px-2.5 py-1"
              style={{ border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <ClaudeIcon size={12} />
              {step === 4 ? <Typed text="Why are orders failing since 10:40?" ms={900} /> : "Why are orders failing since 10:40?"}
            </span>
          </>
        )}
        {step >= 5 && (
          <>
            <span className="flux-in mt-1">
              <span style={{ color: "var(--accent)" }}>●</span> <span style={{ color: "var(--text)" }}>flux · search_logs</span>
              {'(streams: ["orders"], query: "level:ERROR", minutes: 30)'}
            </span>
            <span className="flux-in pl-3" style={{ animationDelay: "500ms" }}>
              ⎿ 42 lines
            </span>
            <span className="flux-in" style={{ animationDelay: "1100ms" }}>
              <span style={{ color: "var(--accent)" }}>●</span> <span style={{ color: "var(--text)" }}>flux · open_query</span>
              {'(stream: "orders", query: "level:ERROR")'}
            </span>
            <span className="flux-in mt-1" style={{ animationDelay: "1900ms", color: "var(--text)" }}>
              Payments started failing at 10:41. Most are <span style={{ color: "var(--red)" }}>card declined</span> (61%) and{" "}
              <span style={{ color: "var(--red)" }}>provider timeout</span> (30%) — the timeouts all come from payments-1. I opened the query in Flux
              for you.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
