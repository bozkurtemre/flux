// The balloons above the status bar: what a background job has to say when it fails, in the
// corner the IDE puts them, rather than in a dialog that takes the window away from you.
import { useEffect } from "react";
import { CircleX, Info, TriangleAlert, X } from "lucide-react";
import { useApp } from "@/store";
import type { Notice } from "@/lib/progress";

export function Notifications() {
  const { notices } = useApp();
  if (!notices.length) return null;
  return (
    <div className="pointer-events-none fixed right-3 bottom-9 z-[60] flex w-[360px] flex-col gap-2">
      {notices.map((n) => (
        <Balloon key={n.id} notice={n} />
      ))}
    </div>
  );
}

const ICON = {
  error: { Glyph: CircleX, color: "var(--red)" },
  warning: { Glyph: TriangleAlert, color: "var(--amber)" },
  info: { Glyph: Info, color: "var(--cyan)" },
};

function Balloon({ notice }: { notice: Notice }) {
  const { dismissNotice } = useApp();
  const { Glyph, color } = ICON[notice.kind];

  // what went wrong waits to be read; what merely happened does not
  useEffect(() => {
    if (notice.kind !== "info") return;
    const t = setTimeout(() => dismissNotice(notice.id), 8000);
    return () => clearTimeout(t);
  }, [notice.id, notice.kind, dismissNotice]);

  return (
    <div
      className="balloon group pointer-events-auto relative rounded-[10px] px-4 py-3"
      style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 14px 40px rgba(0,0,0,.55)" }}
    >
      <button
        onClick={() => dismissNotice(notice.id)}
        title="Dismiss"
        className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-[4px] opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)]"
        style={{ color: "var(--text-dim)" }}
      >
        <X size={12} />
      </button>
      <div className="flex gap-2.5">
        <Glyph size={16} style={{ color }} className="mt-px shrink-0" />
        <div className="min-w-0">
          <p className="truncate pr-5 text-[13px] font-semibold">{notice.title}</p>
          <p className="mt-0.5 text-[13px] break-words" style={{ color: "var(--text-dim)" }}>
            {notice.message}
          </p>
        </div>
      </div>
    </div>
  );
}
