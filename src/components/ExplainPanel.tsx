// The answer to an ⌥-drag across the timeline: which values the stretch holds far more of than
// the time just before it. A row is a field, a value and the two shares, with a bar for each, so
// "90% of the stretch, 10% before" reads at a glance; a click narrows the console to that value.
import { X } from "lucide-react";
import { Spinner } from "./icons";
import { formatTs } from "./ResultGrid";
import { useApp, type Tab } from "@/store";

const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;

function Share({ value, colour }: { value: number; colour: string }) {
  return (
    <span className="flex w-[118px] shrink-0 items-center gap-1.5">
      <span className="h-[6px] flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, background: colour }} />
      </span>
      <span className="w-[38px] text-right tabular-nums">{pct(value)}</span>
    </span>
  );
}

export function ExplainPanel({ tab }: { tab: Tab }) {
  const { patchTab, filterByField, settings } = useApp();
  const e = tab.explain;
  if (!e) return null;
  const zone = settings.results.timezone;
  const span = `${formatTs(new Date(e.from), zone, "time")} – ${formatTs(new Date(e.to), zone, "time")}`;

  return (
    <div className="flex shrink-0 flex-col" style={{ maxHeight: 260, borderBottom: "1px solid var(--border)" }}>
      <div className="flex h-[26px] shrink-0 items-center gap-2 px-2 text-[11px]" style={{ background: "var(--bg-tool)", color: "var(--text-dim)" }}>
        <span className="font-medium" style={{ color: "var(--purple)" }}>
          explain
        </span>
        <span className="truncate">
          {span} against the three times as long before it, over {e.asked.length} fields
        </span>
        {e.running && <Spinner />}
        <button
          onClick={() => patchTab(tab.id, { explain: undefined })}
          data-tip="Close"
          className="ml-auto flex size-5 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
        >
          <X size={12} />
        </button>
      </div>
      <div className="min-h-0 overflow-auto text-[12px]">
        {e.error && (
          <p className="px-3 py-2" style={{ color: "var(--red)" }}>
            {e.error}
          </p>
        )}
        {!e.running && !e.error && !e.rows.length && (
          <p className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
            Nothing stands out: no value of {e.asked.join(", ")} makes up a noticeably larger share of the stretch than before it.
          </p>
        )}
        {e.rows.length > 0 && (
          <div className="flex h-[22px] items-center gap-3 px-3 text-[10.5px]" style={{ color: "var(--text-muted)" }}>
            <span className="w-[150px] shrink-0">field</span>
            <span className="min-w-0 flex-1">value</span>
            <span className="w-[118px] shrink-0">in the stretch</span>
            <span className="w-[118px] shrink-0">before it</span>
          </div>
        )}
        {e.rows.map((r) => (
          <button
            key={`${r.field}=${r.value}`}
            onClick={() => filterByField(tab.id, r.field, r.value)}
            data-tip={`Narrow the console to ${r.field}:"${r.value}"`}
            className="flex h-[24px] w-full items-center gap-3 px-3 text-left hover:bg-[var(--bg-hover)]"
          >
            <span className="w-[150px] shrink-0 truncate font-[var(--font-mono)]" style={{ color: "var(--text-dim)" }}>
              {r.field}
            </span>
            <span className="min-w-0 flex-1 truncate font-[var(--font-mono)]">{r.value}</span>
            <Share value={r.inside} colour="var(--purple)" />
            <Share value={r.before} colour="var(--text-muted)" />
          </button>
        ))}
      </div>
    </div>
  );
}
