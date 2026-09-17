import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { findAll, lines, withMatches, type Span } from "@/lib/find";
import type { Tab } from "@/store";

/** The selected row, as syntax-coloured JSON with strings that hold JSON expanded. */
export function ValueInspector({ tab }: { tab: Tab }) {
  const [copied, setCopied] = useState(false);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const row = tab.selectedRow != null ? tab.page?.rows[tab.selectedRow] : undefined;
  const text = row ? JSON.stringify(expand(row), null, 2) : "";

  // no bar, no highlights; the term itself is kept, so the next ⌘F opens on it
  const matches = useMemo(() => (finding ? findAll(text, query) : []), [finding, text, query]);
  const at = matches.length ? Math.min(current, matches.length - 1) : 0;

  // ⌘F belongs to whatever is in front of you, and while a row is open that is this panel
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFinding(true);
        input.current?.select();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row]);

  const step = (by: number) => matches.length && setCurrent((at + by + matches.length) % matches.length);

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg-tool)" }}>
      <div className="flex h-[26px] shrink-0 items-center gap-2 px-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-[11px] font-medium" style={{ color: "var(--text-dim)" }}>
          Value
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          row {(tab.selectedRow ?? 0) + 1}
        </span>
        <button
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-dim)" }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch {
              /* clipboard unavailable; the text is selectable */
            }
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>

      {finding && (
        <div
          data-find
          className="flex h-[28px] shrink-0 items-center gap-1 px-2"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-editor)" }}
        >
          <input
            ref={input}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCurrent(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") return setFinding(false);
              if (e.key === "Enter") {
                e.preventDefault();
                step(e.shiftKey ? -1 : 1);
              }
            }}
            placeholder="Find in value"
            className="h-[20px] flex-1 rounded-[3px] px-1.5 text-[12px] outline-none"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <span className="w-[54px] shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            {query ? `${matches.length ? at + 1 : 0}/${matches.length}` : ""}
          </span>
          <button className="rounded p-0.5 hover:bg-[var(--bg-hover)]" onClick={() => step(-1)} data-tip="Previous match">
            <ChevronUp size={12} />
          </button>
          <button className="rounded p-0.5 hover:bg-[var(--bg-hover)]" onClick={() => step(1)} data-tip="Next match">
            <ChevronDown size={12} />
          </button>
          <button className="rounded p-0.5 hover:bg-[var(--bg-hover)]" onClick={() => setFinding(false)} data-tip="Close">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="selectable min-h-0 flex-1 overflow-auto p-2 font-[var(--font-mono)] text-[11.5px] leading-[1.6]">
        {row ? <Json text={text} matches={matches} current={at} /> : <span style={{ color: "var(--text-muted)" }}>Select a row</span>}
      </div>
    </div>
  );
}

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function Json({ text, matches, current }: { text: string; matches: { start: number; end: number }[]; current: number }) {
  const here = useRef<HTMLSpanElement>(null);
  useEffect(() => here.current?.scrollIntoView({ block: "nearest" }), [current, matches]);

  return (
    <>
      {lines(text).map(({ line, start }, i) => {
        return (
          <div key={i} className="whitespace-pre-wrap break-all" style={{ color: "var(--syn-op)" }}>
            {withMatches(tokens(line), start, matches).map((span, j) => (
              <span
                key={j}
                ref={span.match === current ? here : undefined}
                style={{
                  color: span.match === undefined ? span.color : undefined,
                  background: span.match === undefined ? undefined : span.match === current ? "var(--accent)" : "var(--sel-blur)",
                }}
              >
                {span.text}
              </span>
            ))}
          </div>
        );
      })}
    </>
  );
}

/** One line as coloured pieces. Markup comes later, once the matches have had their say. */
function tokens(line: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[1]) out.push({ text: m[1], color: "var(--syn-key)" }, { text: m[2] });
    else if (m[3]) out.push({ text: m[3], color: "var(--syn-str)" });
    else if (m[4]) out.push({ text: m[4], color: "var(--purple)" });
    else out.push({ text: m[5], color: "var(--syn-num)" });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/** Log fields routinely hold a JSON blob inside a string; show it as structure. */
function expand(v: unknown, depth = 0): unknown {
  if (depth > 8) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.length > 1 && ((t[0] === "{" && t.endsWith("}")) || (t[0] === "[" && t.endsWith("]")))) {
      try {
        return expand(JSON.parse(t), depth + 1);
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => expand(x, depth + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x, depth + 1)]));
  return v;
}
