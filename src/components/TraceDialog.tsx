// Trace an ID: a request, a trace, an order, a user, pasted from a support question, searched for in every
// stream of a connection at once. The answer opens as a console telling that id's story, oldest
// first, with the lanes above it.
import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { Select } from "./settings/controls";
import { identifying } from "@/lib/correlation";
import { useApp } from "@/store";

const RANGES = [
  { value: 3600, label: "Last hour" },
  { value: 86400, label: "Last 24 hours" },
  { value: 604800, label: "Last 7 days" },
  { value: 2592000, label: "Last 30 days" },
];

export function TraceDialog() {
  const { traceDraft, setTraceDraft, traceId, settings, tabs, activeTab } = useApp();
  if (traceDraft === null) return null;
  // the connection of the console in front is the likeliest one to ask
  const current = tabs.find((t) => t.id === activeTab)?.connId;
  return (
    <Form
      key={traceDraft}
      draft={traceDraft}
      initialConn={current ?? settings.connections[0]?.id ?? ""}
      onClose={() => setTraceDraft(null)}
      run={traceId}
    />
  );
}

function Form({
  draft,
  initialConn,
  onClose,
  run,
}: {
  draft: string;
  initialConn: string;
  onClose: () => void;
  run: (connId: string, value: string, seconds: number) => Promise<void>;
}) {
  const connections = useApp((s) => s.settings.connections);
  const [value, setValue] = useState(draft);
  const [conn, setConn] = useState(initialConn);
  const [seconds, setSeconds] = useState(604800);
  const ok = identifying(value) && connections.some((c) => c.id === conn);
  const go = () => {
    if (!ok) return;
    onClose();
    void run(conn, value, seconds);
  };

  return (
    <div
      data-modal
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[14vh]"
      style={{ background: "rgba(0,0,0,.4)" }}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex w-[520px] max-w-[92vw] flex-col gap-3 rounded-[10px] p-4"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Fingerprint size={15} style={{ color: "var(--accent)" }} /> Trace an ID across every stream
        </div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Request id, trace id, order id, user id, e-mail…"
          spellCheck={false}
          className="h-[32px] rounded-[5px] px-2.5 font-[var(--font-mono)] text-[13px] outline-none"
          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {connections.length > 1 && (
            <Select value={conn} onChange={setConn} options={connections.map((c) => ({ value: c.id, label: c.name || c.url }))} width={200} />
          )}
          <Select value={seconds} onChange={setSeconds} options={RANGES} width={150} />
          <button
            onClick={go}
            disabled={!ok}
            className="ml-auto h-[28px] rounded-[5px] px-3 text-[12.5px] disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            Trace
          </button>
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Searched as text in every stream, oldest first. The lanes over the results show which service said what, and when it failed.
        </p>
      </div>
    </div>
  );
}
