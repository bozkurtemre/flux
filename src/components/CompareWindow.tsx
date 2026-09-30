// Two rows picked in the inspector, leaf by leaf. What the first has and the second lacks is
// red, what only the second has is green, a value that changed is red on one side and green on
// the other, and what they agree on is folded away until asked for — because it is usually
// fifty-eight lines out of sixty.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { diffRows, tally, type Line } from "@/lib/diff";
import { formatTs } from "./ResultGrid";
import { useApp } from "@/store";

const RED = "color-mix(in srgb, var(--red) 16%, transparent)";
const GREEN = "color-mix(in srgb, var(--green) 16%, transparent)";

export function CompareWindow() {
  const { picks, showCompare, clearPicks, settings } = useApp();
  const [swapped, setSwapped] = useState(false);
  const [showSame, setShowSame] = useState(false);
  const [a, b] = swapped ? [picks[1], picks[0]] : [picks[0], picks[1]];
  const lines = useMemo(() => (a && b ? diffRows(a.row, b.row) : []), [a, b]);
  const counts = tally(lines);
  const shown = showSame ? lines : lines.filter((l) => l.change !== "same");

  useEffect(() => {
    if (!showCompare) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && useApp.setState({ showCompare: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCompare]);

  if (!showCompare || !a || !b) return null;
  const when = (at: string) => (at && !Number.isNaN(new Date(at).getTime()) ? formatTs(new Date(at), settings.results.timezone, "iso") : "");

  return (
    <div
      data-modal
      className="fixed inset-0 z-[65] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.45)" }}
      onMouseDown={() => useApp.setState({ showCompare: false })}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[78vh] w-[1100px] max-w-[94vw] flex-col overflow-hidden rounded-[10px]"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex h-[38px] shrink-0 items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[13px] font-semibold">Compare rows</span>
          <span className="flex gap-2 text-[11px] tabular-nums">
            <span style={{ color: "var(--amber)" }}>{counts.changed} changed</span>
            <span style={{ color: "var(--red)" }}>{counts.removed} only in the first</span>
            <span style={{ color: "var(--green)" }}>{counts.added} only in the second</span>
            <span style={{ color: "var(--text-muted)" }}>{counts.same} the same</span>
          </span>
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px]" style={{ color: "var(--text-dim)" }}>
            <input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} />
            Show what is the same
          </label>
          <button
            onClick={() => setSwapped((v) => !v)}
            data-tip="Swap the two"
            className="flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
          >
            <ArrowLeftRight size={13} />
          </button>
          <button onClick={clearPicks} className="text-[11px] hover:underline" style={{ color: "var(--text-dim)" }}>
            Clear picks
          </button>
          <button
            onClick={() => useApp.setState({ showCompare: false })}
            className="flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid shrink-0 grid-cols-[minmax(160px,22%)_1fr_1fr] text-[11px]" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="px-3 py-1.5" style={{ color: "var(--text-muted)" }}>
            field
          </div>
          {[a, b].map((p, i) => (
            <div key={i} className="truncate px-3 py-1.5" style={{ borderLeft: "1px solid var(--border)" }} title={`${p.title} · ${p.at}`}>
              <span style={{ color: i ? "var(--green)" : "var(--red)" }}>{i ? "second" : "first"}</span>{" "}
              <span style={{ color: "var(--text-dim)" }}>
                {p.title} · {when(p.at)}
              </span>
            </div>
          ))}
        </div>

        <div className="selectable min-h-0 flex-1 overflow-auto font-[var(--font-mono)] text-[11.5px]">
          {shown.length ? (
            shown.map((l) => <Row key={l.path} line={l} />)
          ) : (
            <p className="p-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
              The two rows are the same, field for field.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ line }: { line: Line }) {
  const left = line.change === "changed" || line.change === "removed" ? RED : undefined;
  const right = line.change === "changed" || line.change === "added" ? GREEN : undefined;
  const dim = line.change === "same" ? "var(--text-muted)" : "var(--text)";
  return (
    <div className="grid grid-cols-[minmax(160px,22%)_1fr_1fr]" style={{ borderBottom: "1px solid var(--border-soft)" }}>
      <div className="truncate px-3 py-1" style={{ color: line.change === "same" ? "var(--text-muted)" : "var(--syn-key)" }} title={line.path}>
        {line.path}
      </div>
      <Cell value={line.a} present={line.change !== "added"} background={left} color={dim} />
      <Cell value={line.b} present={line.change !== "removed"} background={right} color={dim} />
    </div>
  );
}

function Cell({ value, present, background, color }: { value: unknown; present: boolean; background?: string; color: string }) {
  return (
    <div className="px-3 py-1 break-all whitespace-pre-wrap" style={{ background, color, borderLeft: "1px solid var(--border-soft)" }}>
      {present ? typeof value === "string" ? value : JSON.stringify(value) : <span style={{ color: "var(--text-muted)" }}>—</span>}
    </div>
  );
}
