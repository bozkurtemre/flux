// Where a message is written in the code. The lines holding its literal words, the ones that
// write a log first; the selected one blamed, with the pull request it came in with; and each a
// click away from the IDE, at that line.
import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FileCode2, GitPullRequest, X } from "lucide-react";
import { Spinner } from "./icons";
import { ideName, ideUrl } from "@/lib/source";
import { failureReason } from "@/lib/progress";
import { useApp } from "@/store";

export function LocatedWindow() {
  const { located, blameHit, settings, notify } = useApp();
  const close = () => useApp.setState({ located: null });

  useEffect(() => {
    if (!located) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [located]);

  if (!located) return null;
  const ide = settings.editor.ide;
  const open = (file: string, line: number) =>
    void openUrl(ideUrl(ide, `${located.folder.replace(/\/+$/, "")}/${file}`, line)).catch((e: unknown) =>
      notify("error", `Could not open ${ideName(ide)}`, failureReason(e)),
    );
  const muted = { color: "var(--text-muted)" } as const;

  return (
    <div data-modal className="fixed inset-0 z-[65] flex items-center justify-center" style={{ background: "rgba(0,0,0,.45)" }} onMouseDown={close}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[78vh] w-[860px] max-w-[94vw] flex-col overflow-hidden rounded-[10px]"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex h-[38px] shrink-0 items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="shrink-0 text-[13px] font-semibold">Where is this logged?</span>
          <span className="truncate font-[var(--font-mono)] text-[11px]" style={muted} title={located.template}>
            {located.template}
          </span>
          {located.running && <Spinner />}
          <button onClick={close} className="ml-auto flex size-6 shrink-0 items-center justify-center rounded hover:bg-[var(--bg-hover)]">
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 overflow-auto p-3 text-[12px]">
          {located.error && <p style={{ color: "var(--amber)" }}>{located.error}</p>}
          {located.literals && (
            <p className="pb-2" style={muted}>
              Searched {located.folder} for {located.literals.map((l) => `“${l}”`).join(" and ")}
            </p>
          )}
          {!located.running && !located.error && !located.hits.length && (
            <p style={muted}>No tracked file holds that text. It may be built from pieces at run time, translated, or written by a dependency.</p>
          )}
          {located.hits.map((h, i) => {
            const selected = located.selected === i;
            return (
              <div
                key={`${h.file}:${h.line}`}
                onClick={() => void blameHit(i)}
                className="flex cursor-default flex-col gap-1 rounded-[6px] px-2.5 py-1.5"
                style={{ background: selected ? "var(--bg-active)" : undefined }}
              >
                <div className="flex items-center gap-2">
                  <FileCode2 size={12} style={{ color: "var(--accent)" }} />
                  <span className="truncate font-[var(--font-mono)]">
                    {h.file}
                    <span style={muted}>:{h.line}</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      open(h.file, h.line);
                    }}
                    className="ml-auto shrink-0 rounded px-2 text-[11px] hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--accent)" }}
                  >
                    Open in {ideName(ide)}
                  </button>
                </div>
                <code className="truncate font-[var(--font-mono)] text-[11.5px]" style={{ color: "var(--text-dim)" }}>
                  {h.text}
                </code>
                {selected && (
                  <div className="flex flex-wrap items-center gap-2 text-[11.5px]" style={muted}>
                    {located.blaming && <Spinner />}
                    {located.blame && (
                      <span>
                        last changed in <code className="font-[var(--font-mono)]">{located.blame.sha.slice(0, 8)}</code> by {located.blame.author} on{" "}
                        {located.blame.date} — <span style={{ color: "var(--text)" }}>{located.blame.subject}</span>
                      </span>
                    )}
                    {located.pr && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void openUrl(located.pr!.url);
                        }}
                        className="flex items-center gap-1 rounded px-1.5 hover:bg-[var(--bg-hover)]"
                        style={{ color: "var(--purple)" }}
                      >
                        <GitPullRequest size={11} /> #{located.pr.number} {located.pr.title}
                      </button>
                    )}
                    {!located.blaming && !located.blame && <span>Not committed yet, or not a line git knows.</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
