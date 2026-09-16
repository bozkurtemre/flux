import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { Tab } from "@/store";

/** The selected row, as syntax-coloured JSON with strings that hold JSON expanded. */
export function ValueInspector({ tab }: { tab: Tab }) {
  const [copied, setCopied] = useState(false);
  const row = tab.selectedRow != null ? tab.page?.rows[tab.selectedRow] : undefined;
  const text = row ? JSON.stringify(expand(row), null, 2) : "";

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
      <div className="selectable min-h-0 flex-1 overflow-auto p-2 font-[var(--font-mono)] text-[11.5px] leading-[1.6]">
        {row ? <Json text={text} /> : <span style={{ color: "var(--text-muted)" }}>Select a row</span>}
      </div>
    </div>
  );
}

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function Json({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <div key={i} className="whitespace-pre-wrap break-all" style={{ color: "var(--syn-op)" }}>
          {colorize(line)}
        </div>
      ))}
    </>
  );
}

function colorize(line: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const k = out.length;
    if (m[1])
      out.push(
        <span key={k} style={{ color: "var(--syn-key)" }}>
          {m[1]}
        </span>,
        m[2],
      );
    else if (m[3])
      out.push(
        <span key={k} style={{ color: "var(--syn-str)" }}>
          {m[3]}
        </span>,
      );
    else if (m[4])
      out.push(
        <span key={k} style={{ color: "var(--purple)" }}>
          {m[4]}
        </span>,
      );
    else
      out.push(
        <span key={k} style={{ color: "var(--syn-num)" }}>
          {m[5]}
        </span>,
      );
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
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
