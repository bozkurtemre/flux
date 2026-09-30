import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCopy,
  Code,
  Copy,
  FileCode2,
  Filter,
  FilterX,
  FoldVertical,
  MessageSquare,
  Route,
  X,
} from "lucide-react";
import { findAll, lines, withMatches, type Span } from "@/lib/find";
import { blocksOf, foldAround, visibleLines } from "@/lib/fold";
import { identifying, pairOnLine } from "@/lib/correlation";
import { codeBlock, type Flavour } from "@/lib/export";
import { ideName, sourceRefs } from "@/lib/source";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { useApp } from "@/store";
import type { Tab } from "@/store";

const EMPTY: Set<number> = new Set();

/** The places a row gets pasted into, and what each of them calls a code block. */
const FLAVOURS: { flavour: Flavour; label: string; Glyph: typeof Code }[] = [
  { flavour: "slack", label: "Copy as Slack code block", Glyph: MessageSquare },
  { flavour: "markdown", label: "Copy as Markdown code block", Glyph: Code },
  { flavour: "jira", label: "Copy as Jira code block", Glyph: Code },
];

/** The selected row, as syntax-coloured JSON with strings that hold JSON expanded. */
export function ValueInspector({ tab }: { tab: Tab }) {
  const [copied, setCopied] = useState(false);
  const [copyAs, setCopyAs] = useState<{ x: number; y: number } | null>(null);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const tree = useApp((s) => s.settings.results.jsonTree);
  const ide = useApp((s) => s.settings.editor.ide);
  // the folds belong to the document they were made in: another row is another document, and
  // carrying line numbers over to it would fold whatever happens to be there
  const [kept, setKept] = useState<{ of: string; lines: Set<number> }>({ of: "", lines: new Set() });
  const row = tab.selectedRow != null ? tab.page?.rows[tab.selectedRow] : undefined;
  const text = row ? JSON.stringify(expand(row), null, 2) : "";
  const blocks = useMemo(() => (tree ? blocksOf(text) : new Map<number, number>()), [tree, text]);
  // the files and lines the row names: a stack trace, usually, with the frames that are ours first
  const refs = useMemo(() => sourceRefs(text), [text]);
  const folded = kept.of === text ? kept.lines : EMPTY;

  const fold = (line: number) =>
    setKept(() => {
      const next = new Set(folded);
      if (!next.delete(line)) next.add(line);
      return { of: text, lines: next };
    });
  const foldAll = () => setKept({ of: text, lines: folded.size ? new Set() : new Set([...blocks.keys()].filter((k) => k > 0)) });

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

  // a match under a fold: the fold gives way while that match is the one being looked at,
  // and closes again afterwards. Worked out here rather than remembered, so nothing has to
  // be put back
  /** Anything copied from here says so for a moment, so a silent clipboard is not a mystery. */
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable; the text is selectable */
    }
  };

  // Right-clicking in here acts on what is under the pointer: the selection if there is one,
  // otherwise the pair the line holds. It is the row menu's Follow, reached from the value.
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const onContextMenu = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-line]");
    const selected = window.getSelection()?.toString().trim() ?? "";
    const pair = el ? pairOnLine(text.split("\n")[Number(el.dataset.line)] ?? "") : null;
    const value = selected || pair?.value || "";
    if (!value) return;
    e.preventDefault();
    const field = selected ? undefined : pair?.key;
    const known = field && row && field in row ? field : undefined;
    const app = useApp.getState();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: field ? `Follow this ${field}` : "Follow this value",
          icon: <Route size={12} />,
          disabled: !identifying(value),
          onClick: () => void app.followValue(tab.id, value, field),
        },
        ...(known
          ? [
              { label: `Filter by ${known}`, icon: <Filter size={12} />, onClick: () => app.filterByField(tab.id, known, value) },
              { label: `Exclude ${known}`, icon: <FilterX size={12} />, onClick: () => app.filterByField(tab.id, known, value, true) },
            ]
          : []),
        ...sourceRefs(el ? (text.split("\n")[Number(el.dataset.line)] ?? "") : selected).map((ref) => ({
          label: `Open ${ref.path.split("/").pop()}:${ref.line} in ${ideName(ide)}`,
          icon: <FileCode2 size={12} />,
          onClick: () => app.openSource(tab.id, ref),
        })),
        { separator: true },
        { label: "Copy value", icon: <ClipboardCopy size={12} />, onClick: () => void navigator.clipboard.writeText(value) },
      ],
    });
  };

  const hiding = matches[at] ? foldAround(text.slice(0, matches[at].start).split("\n").length - 1, blocks, folded) : null;
  const shownFolds = hiding == null ? folded : new Set([...folded].filter((l) => l !== hiding));

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg-tool)" }}>
      <div className="flex h-[26px] shrink-0 items-center gap-2 px-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-[11px] font-medium" style={{ color: "var(--text-dim)" }}>
          Value
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          row {(tab.selectedRow ?? 0) + 1}
        </span>
        {tree && !!blocks.size && (
          <button
            onClick={foldAll}
            data-tip={folded.size ? "Expand all" : "Collapse all"}
            className="ml-auto flex size-[18px] items-center justify-center rounded hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-dim)" }}
          >
            <FoldVertical size={11} />
          </button>
        )}
        <button
          className={`${tree && blocks.size ? "" : "ml-auto "}flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-[var(--bg-hover)]`}
          style={{ color: "var(--text-dim)" }}
          data-tip="Right-click for a code block"
          onContextMenu={(e) => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setCopyAs({ x: r.left - 120, y: r.bottom + 4 });
          }}
          onClick={() => void copy(text)}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>

      {refs.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 px-2 py-1" style={{ borderBottom: "1px solid var(--border)" }}>
          <FileCode2 size={11} style={{ color: "var(--text-muted)" }} />
          {refs.slice(0, 6).map((ref) => (
            <button
              key={`${ref.path}:${ref.line}`}
              onClick={() => useApp.getState().openSource(tab.id, ref)}
              data-tip={`Open in ${ideName(ide)}: ${ref.path}:${ref.line}`}
              className="max-w-[220px] truncate rounded px-1.5 py-[1px] font-[var(--font-mono)] text-[10.5px] hover:underline"
              style={{ background: "var(--bg-raised)", color: ref.path.includes("vendor/") ? "var(--text-muted)" : "var(--accent)" }}
            >
              {ref.path.split("/").slice(-2).join("/")}:{ref.line}
            </button>
          ))}
          {refs.length > 6 && (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              +{refs.length - 6}
            </span>
          )}
        </div>
      )}

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

      <div onContextMenu={onContextMenu} className="selectable min-h-0 flex-1 overflow-auto p-2 font-[var(--font-mono)] text-[11.5px] leading-[1.6]">
        {row ? (
          <Json text={text} matches={matches} current={at} blocks={blocks} folded={shownFolds} onFold={fold} />
        ) : (
          <span style={{ color: "var(--text-muted)" }}>Select a row</span>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {copyAs && (
        <ContextMenu
          x={copyAs.x}
          y={copyAs.y}
          items={[
            { label: "Copy", icon: <ClipboardCopy size={12} />, onClick: () => void copy(text) },
            ...FLAVOURS.map(({ flavour, label, Glyph }) => ({
              label,
              icon: <Glyph size={12} />,
              onClick: () => void copy(codeBlock(text, flavour)),
            })),
          ]}
          onClose={() => setCopyAs(null)}
        />
      )}
    </div>
  );
}

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function Json({
  text,
  matches,
  current,
  blocks,
  folded,
  onFold,
}: {
  text: string;
  matches: { start: number; end: number }[];
  current: number;
  blocks: Map<number, number>;
  folded: Set<number>;
  onFold: (line: number) => void;
}) {
  const here = useRef<HTMLSpanElement>(null);
  useEffect(() => here.current?.scrollIntoView({ block: "nearest" }), [current, matches]);

  const all = lines(text);
  const shown = visibleLines(all.length, blocks, folded);

  return (
    <>
      {shown.map((i) => {
        const { line, start } = all[i];
        const end = blocks.get(i);
        const isFolded = folded.has(i);
        return (
          <div key={i} data-line={i} className="group relative whitespace-pre-wrap break-all" style={{ color: "var(--syn-op)" }}>
            {end !== undefined && (
              <button
                onClick={() => onFold(i)}
                className="absolute -left-2 flex size-3.5 items-center justify-center opacity-40 hover:opacity-100"
                style={{ color: "var(--text-dim)" }}
                tabIndex={-1}
              >
                {isFolded ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              </button>
            )}
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
            {isFolded && end !== undefined && <span style={{ color: "var(--text-muted)" }}>{` … ${end - i - 1} lines`}</span>}
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
