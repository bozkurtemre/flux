// A logged request, sent again — to stage, or wherever the base says — with its answer beside
// the one the log kept. The request goes out through the HTTP plugin, from Rust, like every
// other call Flux makes. Authentication is never copied from the log: those headers arrive
// empty, and what is typed into them lives as long as this window does.
import { useEffect, useMemo, useState } from "react";
import { fetch } from "@tauri-apps/plugin-http";
import { Send, TriangleAlert, X } from "lucide-react";
import { requestOf, responseOf } from "@/lib/curl";
import { diffRows, tally } from "@/lib/diff";
import { failureReason } from "@/lib/progress";
import { asJson, headerLines, parseHeaderLines, targetOf, writes } from "@/lib/replay";
import { useApp } from "@/store";

const RED = "color-mix(in srgb, var(--red) 16%, transparent)";
const GREEN = "color-mix(in srgb, var(--green) 16%, transparent)";

const show = (v: unknown) => (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

interface Answer {
  status: number;
  ms: number;
  body: string;
}

export function ReplayWindow() {
  const replay = useApp((s) => s.replay);
  if (!replay) return null;
  return <Replay key={JSON.stringify(replay.row).slice(0, 200)} connId={replay.connId} row={replay.row} />;
}

function Replay({ connId, row }: { connId: string; row: Record<string, unknown> }) {
  const { settings, setSettings } = useApp();
  const logged = useMemo(() => requestOf(row), [row]);
  const kept = useMemo(() => responseOf(row), [row]);
  const [base, setBase] = useState(settings.replay.bases[connId] ?? "");
  const [method, setMethod] = useState(logged?.method ?? "GET");
  const [headers, setHeaders] = useState(() => headerLines(logged?.headers ?? []));
  const [body, setBody] = useState(logged?.body ?? "");
  const [sure, setSure] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const close = () => useApp.setState({ replay: null });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!logged) return null;
  const target = base.trim() ? targetOf(logged.url, base) : "";
  // read off the text rather than parsed: a base half typed is not an error
  const host = /^https?:\/\/([^/]+)/i.exec(target)?.[1];
  const changing = writes(method);
  const emptySecrets = (logged.headers ?? []).filter((h) => h.secret && !parseHeaderLines(headers)[h.name]).map((h) => h.name);
  const ready = !!host && (!changing || sure) && !busy;

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    setError(undefined);
    setAnswer(null);
    // the base is remembered for this connection; the headers, which may hold a token, are not
    if (settings.replay.bases[connId] !== base.trim()) {
      void setSettings({ ...settings, replay: { bases: { ...settings.replay.bases, [connId]: base.trim() } } });
    }
    const started = performance.now();
    try {
      const res = await fetch(target, {
        method,
        headers: parseHeaderLines(headers),
        body: ["GET", "HEAD"].includes(method) || !body ? undefined : body,
        signal: AbortSignal.timeout(30_000),
      });
      setAnswer({ status: res.status, ms: Math.round(performance.now() - started), body: await res.text() });
    } catch (e) {
      setError(failureReason(e));
    } finally {
      setBusy(false);
    }
  };

  const before = asJson(kept.body);
  const now = asJson(answer?.body);
  const lines = before && now ? diffRows(before, now).filter((l) => l.change !== "same") : null;
  const counts = before && now ? tally(diffRows(before, now)) : null;
  const field = "h-[28px] rounded-[5px] px-2 font-[var(--font-mono)] text-[12px] outline-none";
  const box = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)" } as const;

  return (
    <div data-modal className="fixed inset-0 z-[65] flex items-center justify-center" style={{ background: "rgba(0,0,0,.45)" }} onMouseDown={close}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[82vh] w-[1100px] max-w-[94vw] flex-col overflow-hidden rounded-[10px]"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex h-[38px] shrink-0 items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[13px] font-semibold">Replay a logged request</span>
          <span className="truncate font-[var(--font-mono)] text-[11px]" style={{ color: "var(--text-muted)" }}>
            logged as {logged.method} {logged.url}
          </span>
          <button onClick={close} className="ml-auto flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]">
            <X size={14} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* what goes out */}
          <div className="flex w-[46%] min-w-0 flex-col gap-2 overflow-auto p-4" style={{ borderRight: "1px solid var(--border)" }}>
            <label className="text-[11px]" style={{ color: "var(--text-dim)" }}>
              Send to (remembered for this connection)
            </label>
            <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://stage-api.example.com" className={field} style={box} />
            <div className="flex items-center gap-2">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={field} style={box}>
                {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <span
                className="min-w-0 truncate font-[var(--font-mono)] text-[11.5px]"
                style={{ color: target ? "var(--text)" : "var(--text-muted)" }}
              >
                {target || "where it goes appears here"}
              </span>
            </div>
            <label className="pt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
              Headers — one per line; authentication is never copied from the log
            </label>
            <textarea
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              rows={7}
              spellCheck={false}
              className="rounded-[5px] p-2 font-[var(--font-mono)] text-[12px] outline-none"
              style={box}
            />
            {emptySecrets.length > 0 && (
              <span className="text-[11px]" style={{ color: "var(--amber)" }}>
                {emptySecrets.join(", ")} {emptySecrets.length === 1 ? "is" : "are"} empty: fill in a stage value, or it is not sent.
              </span>
            )}
            <label className="pt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              spellCheck={false}
              className="rounded-[5px] p-2 font-[var(--font-mono)] text-[12px] outline-none"
              style={box}
            />
            {changing && (
              <label className="flex items-start gap-2 text-[11.5px]" style={{ color: "var(--amber)" }}>
                <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5" />
                <span>
                  <TriangleAlert size={11} className="mr-1 inline" />
                  {method} changes something on {host ?? "the other end"}. Send it there anyway.
                </span>
              </label>
            )}
            <button
              onClick={() => void send()}
              disabled={!ready}
              className="flex h-[30px] items-center justify-center gap-1.5 rounded-[5px] text-[12.5px] disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              <Send size={12} /> {busy ? "Sending…" : "Send"}
            </button>
          </div>

          {/* what came back, beside what the log kept */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-auto p-4 text-[12px]">
            <div className="flex flex-wrap items-center gap-3">
              <span style={{ color: "var(--text-dim)" }}>
                logged: <b style={{ color: (kept.status ?? 0) >= 500 ? "var(--red)" : "var(--text)" }}>{kept.status ?? "no status in the log"}</b>
              </span>
              {answer && (
                <span style={{ color: "var(--text-dim)" }}>
                  now:{" "}
                  <b style={{ color: answer.status >= 500 ? "var(--red)" : answer.status >= 400 ? "var(--amber)" : "var(--green)" }}>
                    {answer.status}
                  </b>{" "}
                  in {answer.ms.toLocaleString()} ms
                </span>
              )}
              {counts && (
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {counts.changed} changed · {counts.removed} gone · {counts.added} new · {counts.same} the same
                </span>
              )}
            </div>
            {error && <p style={{ color: "var(--red)" }}>{error}</p>}
            {!answer && !error && <p style={{ color: "var(--text-muted)" }}>Send it, and the answer appears here beside the one in the log.</p>}
            {lines && (
              <div className="font-[var(--font-mono)] text-[11.5px]">
                {lines.length === 0 && <p style={{ color: "var(--green)" }}>The same answer, leaf for leaf.</p>}
                {lines.map((l) => (
                  <div key={l.path} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-1 py-[2px]">
                    <span className="truncate" style={{ color: "var(--text-dim)" }} title={l.path}>
                      {l.path}
                    </span>
                    <span className="truncate" style={{ background: l.change === "added" ? undefined : RED }} title={show(l.a)}>
                      {show(l.a)}
                    </span>
                    <span className="truncate" style={{ background: l.change === "removed" ? undefined : GREEN }} title={show(l.b)}>
                      {show(l.b)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {answer && !lines && (
              <div className="grid min-h-0 grid-cols-2 gap-2">
                <pre className="overflow-auto rounded-[5px] p-2 font-[var(--font-mono)] text-[11.5px] whitespace-pre-wrap" style={box}>
                  {kept.body ?? "The log kept no response body."}
                </pre>
                <pre className="overflow-auto rounded-[5px] p-2 font-[var(--font-mono)] text-[11.5px] whitespace-pre-wrap" style={box}>
                  {answer.body || "(empty)"}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
