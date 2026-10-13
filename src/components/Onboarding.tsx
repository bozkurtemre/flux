// The tour, shown once right after signing in: the three things a first hour with Flux needs,
// played on a drawing of the app rather than told. A cursor moves, clicks and types; each step
// loops until the next is asked for, so it can be watched twice. The drawing uses the app's own
// colours, like the slice beside the sign-in, and every target sits at a fixed spot in a frame
// of a fixed size, so the cursor lands on what it clicks without measuring anything.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bell, BellRing, Database, Plus, Search } from "lucide-react";
import { UI } from "./darkUi";

/** Where the cursor goes, whether it clicks there, a shortcut shown instead, and how long it stays. */
type Beat = { at: [number, number]; click?: boolean; keys?: string; hold: number };

/** How long the cursor takes to travel; what it clicks changes when it arrives. */
const MOVE = 750;

const W = 800;
const H = 420;

type Scene = {
  title: string;
  text: ReactNode;
  beats: Beat[];
  /** The frame, as it is once beat `landed` has happened. */
  draw: (landed: number) => ReactNode;
};

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
      { at: [600, 330], hold: 700 },
      { at: [101, 114], click: true, hold: 700 },
      { at: [248, 149], click: true, hold: 600 },
      { at: [380, 206], click: true, hold: 1500 },
      { at: [380, 254], click: true, hold: 1300 },
      { at: [512, 315], click: true, hold: 3000 },
    ],
    draw: (l) => (
      <>
        <Tree connected={l >= 5} />
        <Editor>{l < 5 && <Empty icon={<Database size={20} />} text="No connections yet" />}</Editor>
        {l >= 1 && l < 5 && <ConnectionDialog kind={l >= 2} url={l >= 3} token={l >= 4} />}
        {l >= 5 && <Toast icon={<Database size={12} />} title="Connected to acme · prod" text="12 streams found" />}
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
      { at: [480, 340], hold: 600 },
      { at: [90, 93], click: true, hold: 500 },
      { at: [330, 71], click: true, hold: 1300 },
      { at: [345, 88], keys: "⌘ ⏎", hold: 1300 },
      { at: [345, 88], keys: "⌘ S", hold: 1400 },
      { at: [503, 202], click: true, hold: 3000 },
    ],
    draw: (l) => (
      <>
        <Tree connected open={l >= 1} />
        <Editor side>
          {l >= 1 ? <Console query={l >= 2 ? "level:ERROR" : ""} typing={l === 2} results={l >= 3} /> : <Empty text="Open a stream to start" />}
        </Editor>
        <SavedPanel saved={l >= 5 ? ["Payment errors"] : []} fresh={l === 5} />
        {l === 4 && <SavePopover />}
      </>
    ),
  },
  {
    title: "Let Flux watch it",
    text: (
      <>
        The bell on a saved query tells you when new matches arrive, while Flux is open — or, with <b>Alert when › Nothing arrives</b>, when a cron or
        a webhook goes quiet.
      </>
    ),
    beats: [
      { at: [420, 300], hold: 600 },
      { at: [773, 69], click: true, hold: 900 },
      { at: [430, 250], hold: 1200 },
      { at: [660, 379], click: true, hold: 3000 },
    ],
    draw: (l) => (
      <>
        <Tree connected open />
        <Editor side>
          <Console query="level:ERROR" results fresh={l >= 3} />
        </Editor>
        <SavedPanel saved={["Payment errors", "Slow checkouts"]} watching={l >= 1} />
        {l === 2 && <Toast icon={<BellRing size={12} />} title="Payment errors" text="3 new matches · click to see them" />}
      </>
    ),
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === SCENES.length - 1;
  const scene = SCENES[step];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, SCENES.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <div
      className="relative flex h-full flex-col items-center justify-center gap-7 px-8 py-12"
      style={{ background: "var(--bg-window)", color: "var(--text)" }}
    >
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-[38px]" />
      <div className="flex w-[800px] max-w-full items-end justify-between gap-8">
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
      <Stage key={step} scene={scene} />

      <div className="flex w-[800px] max-w-full items-center justify-between">
        <div className="flex gap-1.5">
          {SCENES.map((s, i) => (
            <button
              key={s.title}
              onClick={() => setStep(i)}
              aria-label={s.title}
              className="h-[6px] rounded-full transition-all"
              style={{ width: i === step ? 22 : 6, background: i === step ? "var(--accent)" : "var(--border)" }}
            />
          ))}
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

/** One scene, played: the cursor travels to each beat, and what it does there happens on arrival. */
function Stage({ scene }: { scene: Scene }) {
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
  return (
    <div className="relative max-w-full" style={{ width: W }}>
      <div
        className="relative overflow-hidden rounded-[12px] text-[11px] select-none"
        style={{
          width: W,
          height: H,
          background: UI.window,
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          color: UI.text,
        }}
      >
        <TitleBar />
        {scene.draw(landed)}

        {arrived && now.click && (
          <span
            key={beat}
            className="flux-click pointer-events-none absolute size-[34px] rounded-full"
            style={{ left: now.at[0] - 17, top: now.at[1] - 17, border: `2px solid ${UI.accent}`, background: "rgba(53,116,240,0.18)" }}
          />
        )}
        {arrived && now.keys && (
          <span key={`k${beat}`} className="flux-in pointer-events-none absolute flex gap-1" style={{ left: now.at[0] + 18, top: now.at[1] - 34 }}>
            {now.keys.split(" ").map((k) => (
              <kbd
                key={k}
                className="flex h-[26px] min-w-[26px] items-center justify-center rounded-[6px] px-1.5 text-[13px] font-medium"
                style={{ background: UI.hover, border: `1px solid ${UI.border}`, borderBottomWidth: 3, color: UI.text }}
              >
                {k}
              </kbd>
            ))}
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
      width="18"
      height="24"
      viewBox="0 0 18 24"
      className="pointer-events-none absolute top-0 left-0 z-20"
      style={{
        transform: `translate(${at[0] - 2}px, ${at[1] - 2}px) scale(${pressed ? 0.88 : 1})`,
        transformOrigin: "2px 2px",
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

function TitleBar() {
  return (
    <div className="flex h-[30px] items-center gap-3 px-3">
      <span className="flex gap-[6px]">
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} className="size-[10px] rounded-full" style={{ background: c }} />
        ))}
      </span>
      <span style={{ color: UI.muted }}>Flux</span>
    </div>
  );
}

/** The tree on the left: empty with its add button, or one connection and its streams. */
function Tree({ connected, open }: { connected?: boolean; open?: boolean }) {
  const streams = ["orders", "gateway", "wallet"];
  return (
    <div className="overflow-hidden rounded-[10px]" style={box({ left: 6, top: 30, width: 190, height: H - 36, background: UI.editor })}>
      <div className="flex h-[28px] items-center px-3 text-[11.5px] font-semibold">Connection Explorer</div>
      {!connected ? (
        <div
          className="flex items-center justify-center gap-1.5 rounded-[6px]"
          style={box({ left: 12, top: 70, width: 166, height: 28, border: `1px dashed ${UI.border}`, color: UI.dim })}
        >
          <Plus size={12} /> Add connection
        </div>
      ) : (
        <div className="flux-in" style={box({ left: 0, top: 30, right: 0 })}>
          <Row depth={0} icon={<Database size={11} color={UI.key} />} label="acme · prod" />
          {streams.map((s) => (
            <Row
              key={s}
              depth={1}
              icon={<span className="size-[7px] rounded-[2px]" style={{ background: UI.green }} />}
              label={s}
              selected={open && s === "orders"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ depth, icon, label, selected }: { depth: number; icon: ReactNode; label: string; selected?: boolean }) {
  return (
    <div className="flex h-[22px] items-center gap-1.5" style={{ paddingLeft: 12 + depth * 16, background: selected ? UI.selection : undefined }}>
      {icon}
      {label}
    </div>
  );
}

/** The editor in the middle; with `side`, it leaves room for the panel on the right. */
function Editor({ side, children }: { side?: boolean; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[10px]" style={box({ left: 202, top: 30, right: side ? 212 : 6, height: H - 36, background: UI.editor })}>
      {children}
    </div>
  );
}

function Empty({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2" style={{ color: UI.muted }}>
      {icon}
      {text}
    </div>
  );
}

const ROWS: [string, string, string][] = [
  ["10:42:09.412", "orders", "Payment failed for ord-10531: card declined"],
  ["10:42:08.388", "orders", "Payment failed for ord-10529: provider timeout"],
  ["10:41:57.901", "orders", "Refund failed for ord-10488: amount mismatch"],
  ["10:41:44.517", "orders", "Payment failed for ord-10502: card declined"],
  ["10:41:30.240", "orders", "Payment failed for ord-10497: 3DS abandoned"],
  ["10:41:12.903", "orders", "Payment failed for ord-10490: provider timeout"],
];

/** A console: its tab, the query line, and — once it has run — the timeline and the rows. */
function Console({ query, typing, results, fresh }: { query: string; typing?: boolean; results?: boolean; fresh?: boolean }) {
  const counts = [4, 6, 5, 7, 5, 8, 6, 9, 14, 22, 18, 11, 8, 7, 9, 6, 5, 7, 6, 8];
  const peak = Math.max(...counts);
  const rows = fresh ? [["10:42:31.007", "orders", "Payment failed for ord-10544: card declined"] as const, ...ROWS] : ROWS;
  return (
    <>
      <div className="flex h-[26px] items-center gap-1.5 px-2.5" style={{ borderBottom: `1px solid ${UI.border}` }}>
        <span className="flex h-[20px] items-center gap-1.5 rounded-[5px] px-2" style={{ background: UI.tool }}>
          <span className="size-[7px] rounded-[2px]" style={{ background: UI.green }} />
          orders
        </span>
      </div>
      <div className="flex h-[30px] items-center gap-3 font-[var(--font-mono)] text-[11.5px]" style={{ borderBottom: `1px solid ${UI.border}` }}>
        <span className="w-[22px] text-right" style={{ color: UI.muted }}>
          1
        </span>
        {query ? (
          <span>
            {typing ? (
              <Typed text={query} />
            ) : (
              <>
                <span style={{ color: UI.key }}>level</span>
                <span style={{ color: UI.dim }}>:</span>
                <span style={{ color: UI.str }}>ERROR</span>
              </>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1" style={{ color: UI.muted }}>
            <Search size={11} /> Lucene query
          </span>
        )}
        <span className="mr-2.5 ml-auto rounded-[5px] px-2 py-[2px]" style={{ background: UI.hover, color: UI.green }}>
          ▶ <span style={{ color: UI.dim }}>Last 1 hour</span>
        </span>
      </div>
      {results && (
        <div className="flux-in">
          <div className="px-2.5 pt-2 pb-1.5" style={{ borderBottom: `1px solid ${UI.border}` }}>
            <div className="pb-1 text-[10px]" style={{ color: UI.muted }}>
              {fresh ? 147 : 144} messages
            </div>
            <div className="flex h-[40px] items-end gap-px">
              {counts.map((c, i) => (
                <div key={i} className="flex-1 rounded-[1px]" style={{ height: `${(c / peak) * 40}px`, background: UI.red, opacity: 0.7 }} />
              ))}
            </div>
          </div>
          <div className="font-[var(--font-mono)] text-[10.5px]">
            {rows.map(([at, , message], i) => (
              <div
                key={at}
                className={`flex h-[22px] items-center gap-2 px-2.5 ${fresh && i === 0 ? "flux-flash" : ""}`}
                style={{ background: i % 2 ? UI.stripe : undefined }}
              >
                <span style={{ color: UI.dim }}>{at}</span>
                <span className="font-semibold" style={{ color: UI.red }}>
                  ERROR
                </span>
                <span className="truncate">{message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Saved Queries, on the right, with each query's bell. */
function SavedPanel({ saved, fresh, watching }: { saved: string[]; fresh?: boolean; watching?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[10px]" style={box({ right: 6, top: 30, width: 200, height: H - 36, background: UI.editor })}>
      <div className="flex h-[28px] items-center px-3 text-[11.5px] font-semibold">Queries</div>
      {!saved.length && (
        <p className="px-3 pt-1" style={{ color: UI.muted }}>
          Nothing saved yet.
        </p>
      )}
      {saved.map((name, i) => {
        const on = watching && i === 0;
        return (
          <div key={name} className={`flex h-[22px] items-center gap-1.5 px-3 ${fresh ? "flux-in flux-flash" : ""}`}>
            <Search size={11} color={UI.dim} />
            <span className="truncate">{name}</span>
            <span
              className="ml-auto flex size-[18px] items-center justify-center rounded-[4px]"
              style={{ background: on ? "rgba(53,116,240,0.2)" : undefined }}
            >
              {on ? <BellRing size={11} color={UI.accent} /> : <Bell size={11} color={UI.muted} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SavePopover() {
  return (
    <div
      className="flux-in rounded-[10px] p-3"
      style={box({
        left: 300,
        top: 120,
        width: 240,
        background: UI.tool,
        border: `1px solid ${UI.border}`,
        boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
      })}
    >
      <p className="pb-1.5 font-semibold">Save query</p>
      <div className="flex h-[26px] items-center rounded-[6px] px-2" style={{ background: UI.window, border: `1px solid ${UI.accent}` }}>
        <Typed text="Payment errors" ms={700} />
      </div>
      <div className="mt-2.5 flex justify-end">
        <span className="rounded-[6px] px-3 py-[5px] font-medium" style={{ background: UI.accent, color: "#fff" }}>
          Save
        </span>
      </div>
    </div>
  );
}

/** Settings › Connections, cut down to the fields a first connection needs. */
function ConnectionDialog({ kind, url, token }: { kind: boolean; url: boolean; token: boolean }) {
  const field = (top: number, label: string, value: ReactNode) => (
    <>
      <span style={box({ left: 16, top: top - 16, color: UI.dim })}>{label}</span>
      <div
        className="flex items-center rounded-[6px] px-2 font-[var(--font-mono)]"
        style={box({ left: 16, top, width: 348, height: 28, background: UI.window, border: `1px solid ${UI.border}` })}
      >
        {value}
      </div>
    </>
  );
  return (
    <>
      <div className="flux-in" style={box({ inset: 0, background: "rgba(0,0,0,0.35)" })} />
      <div
        className="flux-in rounded-[12px]"
        style={box({
          left: 190,
          top: 80,
          width: 380,
          height: 270,
          background: UI.tool,
          border: `1px solid ${UI.border}`,
          boxShadow: "0 20px 50px rgba(0,0,0,0.55)",
        })}
      >
        <p className="font-semibold" style={box({ left: 16, top: 14, fontSize: 13 })}>
          New connection
        </p>
        <span style={box({ left: 16, top: 40, color: UI.dim })}>Source</span>
        {["Graylog", "Kibana", "Local"].map((k, i) => {
          const on = kind && i === 0;
          return (
            <span
              key={k}
              className="flex items-center justify-center rounded-[6px]"
              style={box({
                left: 16 + i * 90,
                top: 56,
                width: 84,
                height: 26,
                border: `1px solid ${on ? UI.accent : UI.border}`,
                background: on ? "rgba(53,116,240,0.18)" : undefined,
                color: on ? UI.text : UI.dim,
              })}
            >
              {k}
            </span>
          );
        })}
        {field(112, "Graylog URL", url ? <Typed text="https://graylog.acme.io" /> : <span style={{ color: UI.muted }}>https://</span>)}
        {field(160, "Access token", token ? <Typed text="••••••••••••••••" ms={700} /> : null)}
        <span
          className="flex items-center justify-center rounded-[6px]"
          style={box({ left: 192, top: 220, width: 84, height: 30, border: `1px solid ${UI.border}`, color: UI.dim })}
        >
          Cancel
        </span>
        <span
          className="flex items-center justify-center rounded-[6px] font-medium"
          style={box({ left: 280, top: 220, width: 84, height: 30, background: UI.accent, color: "#fff", opacity: token ? 1 : 0.5 })}
        >
          Save
        </span>
      </div>
    </>
  );
}

function Toast({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div
      className="flux-in flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
      style={box({
        right: 16,
        bottom: 16,
        width: 250,
        background: UI.tool,
        border: `1px solid ${UI.border}`,
        boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
      })}
    >
      <span
        className="flex size-[24px] shrink-0 items-center justify-center rounded-[6px]"
        style={{ background: "rgba(53,116,240,0.2)", color: UI.accent }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate" style={{ color: UI.dim }}>
          {text}
        </span>
      </span>
    </div>
  );
}
