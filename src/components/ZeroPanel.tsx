// Shown when a search finds nothing: which of its terms is to blame. Each term is counted with
// the others, and the one whose absence brings rows back is drawn first; a field the stream does
// not have is said so, with the one it most likely meant. One click takes the term out, or puts
// the right field in.
import { SearchX } from "lucide-react";
import { Spinner } from "./icons";
import { parseQuery, withSearch } from "@/lib/query";
import { andTerms, without } from "@/lib/zero";
import { useApp, type Tab } from "@/store";

export function ZeroPanel({ tab }: { tab: Tab }) {
  const { patchTab, runQuery } = useApp();
  const z = tab.zero;
  if (!z || tab.page?.rows.length) return null;
  const terms = andTerms(parseQuery(tab.query).search);
  const rewrite = (search: string) => {
    patchTab(tab.id, { query: withSearch(tab.query, search), offset: 0 });
    void runQuery(tab.id);
  };
  // the term to blame first: the one whose absence brings back the most
  const order = z.terms.map((t, i) => ({ ...t, i })).sort((a, b) => (b.without ?? -1) - (a.without ?? -1));

  return (
    <div className="flex shrink-0 flex-col gap-1 px-3 py-2 text-[12px]" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2" style={{ color: "var(--text-dim)" }}>
        <SearchX size={13} style={{ color: "var(--amber)" }} />
        <span className="font-medium" style={{ color: "var(--text)" }}>
          Why no rows?
        </span>
        {z.running && <Spinner />}
        {z.everything != null && (
          <span>
            {z.everything === 0
              ? "The window holds nothing at all on these streams, with no search: no term is to blame. Try a longer range."
              : `The window holds ${z.everything.toLocaleString()} messages with no search.`}
          </span>
        )}
      </div>
      {z.everything !== 0 &&
        order.map((t) => (
          <div key={t.i} className="flex h-[24px] items-center gap-2">
            <code
              className="min-w-0 truncate rounded px-1.5 font-[var(--font-mono)] text-[11.5px]"
              style={{ background: "var(--bg-active)" }}
              title={t.term}
            >
              {t.term}
            </code>
            {t.known === false && (
              <span style={{ color: "var(--red)" }}>
                no field <b>{t.field}</b> on this stream
                {t.suggest && (
                  <>
                    {" "}
                    —{" "}
                    <button
                      onClick={() =>
                        t.field && t.suggest && rewrite(terms.map((x, i) => (i === t.i ? x.replace(t.field!, t.suggest!) : x)).join(" AND "))
                      }
                      className="underline"
                      style={{ color: "var(--accent)" }}
                    >
                      use {t.suggest}
                    </button>
                  </>
                )}
              </span>
            )}
            {t.without != null && (
              <span style={{ color: t.without > 0 ? "var(--green)" : "var(--text-muted)" }}>
                {t.without > 0 ? `without it: ${t.without.toLocaleString()} rows` : "without it: still nothing"}
              </span>
            )}
            {terms.length > 1 && (
              <button
                onClick={() => rewrite(without(terms, t.i))}
                data-tip="Run the search without this term"
                className="ml-auto shrink-0 rounded px-2 text-[11px] hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--accent)" }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      {z.everything !== 0 && terms.length === 1 && !z.running && z.terms[0]?.known !== false && (
        <span style={{ color: "var(--text-muted)" }}>
          One term, and it matches nothing in this window: the value may never occur here, or occur under another field.
        </span>
      )}
    </div>
  );
}
