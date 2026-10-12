// Investigate: one error, made into a case. The evidence arrives a part at a time — the request
// across services, how often, who else, the code and what was merged — and the case goes on, in
// one click, to Claude Code in the project's terminal: find the cause, fix it on a branch, open a
// draft pull request.
import { useEffect, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ClipboardCopy, FileCode2, Fingerprint, GitPullRequest, Microscope, X } from "lucide-react";
import { ClaudeIcon, Spinner } from "./icons";
import { sendToClaude } from "./TerminalPanel";
import { promptOf, reportOf } from "@/lib/investigate";
import { ideName, ideUrl } from "@/lib/source";
import { useApp } from "@/store";

function Card({ title, busy, children }: { title: string; busy: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[8px] p-3" style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        {title} {busy && <Spinner />}
      </div>
      {children ?? (!busy && <span style={{ color: "var(--text-muted)" }}>Nothing found.</span>)}
    </div>
  );
}

export function InvestigationWindow() {
  const { investigation: inv, settings, projectFolders, tabs, traceId, notify } = useApp();
  const close = () => useApp.setState({ investigation: null });

  useEffect(() => {
    if (!inv) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inv]);

  if (!inv) return null;
  const e = inv.evidence;
  const busy = (part: string) => inv.pending.includes(part);
  const done = !inv.pending.length;
  const report = reportOf(e);
  const tab = tabs.find((t) => t.id === inv.tabId);
  const project = tab ? settings.projects.find((p) => p.connectionId === tab.connId && p.streams.some((s) => tab.streamIds.includes(s))) : undefined;
  const folder = project ? projectFolders[project.id] : undefined;
  const muted = { color: "var(--text-muted)" } as const;
  const failing = e.trace?.failures[0];

  return (
    <div data-modal className="fixed inset-0 z-[65] flex items-center justify-center" style={{ background: "rgba(0,0,0,.5)" }} onMouseDown={close}>
      <div
        onMouseDown={(ev) => ev.stopPropagation()}
        className="flex max-h-[88vh] w-[980px] max-w-[95vw] flex-col overflow-hidden rounded-[10px]"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex shrink-0 items-start gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <Microscope size={16} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold">{e.subject.message.split("\n")[0]}</div>
            <div className="text-[11.5px]" style={muted}>
              {e.subject.stream} · {e.subject.at}
              {e.subject.level ? ` · ${e.subject.level}` : ""}
            </div>
          </div>
          {!done && <Spinner />}
          <button onClick={close} className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-[var(--bg-hover)]">
            <X size={14} />
          </button>
        </div>

        <div className="grid min-h-0 grid-cols-2 gap-3 overflow-auto p-4 text-[12px]">
          <Card title="The request across services" busy={busy("trace")}>
            {e.trace && (
              <>
                <span style={muted}>
                  {e.trace.field} = <code className="font-[var(--font-mono)]">{e.trace.value}</code>
                </span>
                {e.trace.lanes.map((l) => (
                  <div key={l.stream} className="flex items-center gap-2">
                    <span className="size-[7px] rounded-full" style={{ background: l.errors ? "var(--red)" : "var(--green)" }} />
                    <span className="min-w-0 flex-1 truncate">{l.stream}</span>
                    <span className="tabular-nums" style={l.errors ? { color: "var(--red)" } : muted}>
                      {l.lines} lines{l.errors ? ` · ${l.errors} failed` : ""}
                    </span>
                  </div>
                ))}
                {failing && (
                  <div className="mt-1 rounded p-2" style={{ background: "color-mix(in srgb, var(--red) 10%, transparent)" }}>
                    <div className="text-[10.5px]" style={{ color: "var(--red)" }}>
                      first failure · {failing.stream}
                    </div>
                    <div className="line-clamp-2 font-[var(--font-mono)] text-[11px]">{failing.message.split("\n")[0]}</div>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card title="How often, and who else" busy={busy("frequency") || busy("spread")}>
            {(e.frequency || e.spread) && (
              <>
                {e.frequency && (
                  <div>
                    <b className="text-[18px] tabular-nums">{e.frequency.lastHour.toLocaleString()}</b> <span style={muted}>in the last hour ·</span>{" "}
                    <b className="tabular-nums">{e.frequency.lastDay.toLocaleString()}</b> <span style={muted}>in 24 hours</span>
                    {e.frequency.firstSeen && <div style={muted}>first seen {e.frequency.firstSeen}</div>}
                  </div>
                )}
                {e.spread && (
                  <div>
                    <b className="tabular-nums">{e.spread.ids.toLocaleString()}</b>{" "}
                    <span style={muted}>
                      distinct {e.spread.idKind ?? "ids"} hit, in a sample of {e.spread.sampled}
                    </span>
                    {e.spread.shared.map((s) => (
                      <div key={s.field} className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate font-[var(--font-mono)] text-[11px]">
                          {s.field}={s.value}
                        </code>
                        <span className="tabular-nums" style={{ color: "var(--amber)" }}>
                          {Math.round(s.share * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          <Card title="The code" busy={busy("code")}>
            {!busy("code") && !folder && (
              <span style={muted}>
                {project
                  ? `Set ${project.name}'s folder in Settings › Projects to find the code.`
                  : "This stream is in no project, so there is no checkout to search."}
              </span>
            )}
            {e.code && (
              <>
                <button
                  onClick={() => folder && void openUrl(ideUrl(settings.editor.ide, `${folder.replace(/\/+$/, "")}/${e.code!.file}`, e.code!.line))}
                  className="flex items-center gap-1.5 text-left font-[var(--font-mono)]"
                  style={{ color: "var(--accent)" }}
                  data-tip={`Open in ${ideName(settings.editor.ide)}`}
                >
                  <FileCode2 size={12} /> {e.code.file}:{e.code.line}
                </button>
                {e.code.text && (
                  <code className="truncate font-[var(--font-mono)] text-[11px]" style={{ color: "var(--text-dim)" }}>
                    {e.code.text}
                  </code>
                )}
                <span className="text-[11px]" style={muted}>
                  {e.code.from === "stack" ? "from the stack trace" : "found by the message's words"}
                </span>
                {e.code.blame && (
                  <span className="text-[11.5px]">
                    last changed by {e.code.blame.author} on {e.code.blame.date}: <span style={muted}>{e.code.blame.subject}</span>
                  </span>
                )}
                {e.code.pr && (
                  <button
                    onClick={() => void openUrl(e.code!.pr!.url)}
                    className="flex items-center gap-1 text-left"
                    style={{ color: "var(--purple)" }}
                  >
                    <GitPullRequest size={11} /> #{e.code.pr.number} {e.code.pr.title}
                  </button>
                )}
              </>
            )}
          </Card>

          <Card title="Merged in the last 48 hours" busy={busy("merges")}>
            {!!e.merges?.length &&
              e.merges.slice(0, 6).map((m) => (
                <button
                  key={m.url}
                  onClick={() => void openUrl(m.url)}
                  className="flex items-center gap-1.5 text-left"
                  style={{ color: "var(--purple)" }}
                >
                  <GitPullRequest size={11} className="shrink-0" />
                  <span className="truncate">{m.label}</span>
                  <span className="ml-auto shrink-0 text-[10.5px]" style={muted}>
                    {m.at.slice(5, 16).replace("T", " ")}
                  </span>
                </button>
              ))}
            {!busy("merges") && !e.merges?.length && (
              <span style={muted}>{project?.github ? "Nothing merged." : "The project names no repository."}</span>
            )}
          </Card>
        </div>

        <div className="flex shrink-0 items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(report)
                .then(() => notify("info", "Report copied", "The case as Markdown, ready for Jira, Slack or a pull request."))
            }
            className="flex h-[30px] items-center gap-1.5 rounded-[5px] px-3 text-[12px] hover:bg-[var(--bg-hover)]"
          >
            <ClipboardCopy size={12} /> Copy report
          </button>
          {e.trace && (
            <button
              onClick={() => (close(), void traceId(inv.connId, e.trace!.value, 3600))}
              className="flex h-[30px] items-center gap-1.5 rounded-[5px] px-3 text-[12px] hover:bg-[var(--bg-hover)]"
            >
              <Fingerprint size={12} /> Trace the request
            </button>
          )}
          <span className="ml-auto text-[11px]" style={muted}>
            {done ? "Pastes the case into the terminal where Claude Code runs." : "Still gathering…"}
          </span>
          <button
            onClick={() => {
              void sendToClaude(promptOf(report, e.subject.message));
              close();
            }}
            disabled={!done}
            className="flex h-[30px] items-center gap-1.5 rounded-[5px] px-3.5 text-[12.5px] font-medium disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            <ClaudeIcon size={13} /> Ask Claude to fix
          </button>
        </div>
      </div>
    </div>
  );
}
