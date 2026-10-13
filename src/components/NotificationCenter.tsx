// Everything Flux has said this session. A balloon shows for a few seconds and goes, which is
// right for something you are watching and wrong for something you were not: the same notices
// stay here, newest first, with whatever they offered still on them.
import { CircleX, Info, Trash2, TriangleAlert, X } from "lucide-react";
import { useApp } from "@/store";
import type { NoticeKind } from "@/lib/progress";

const GLYPH: Record<NoticeKind, { Icon: typeof Info; color: string }> = {
  error: { Icon: CircleX, color: "var(--red)" },
  warning: { Icon: TriangleAlert, color: "var(--amber)" },
  info: { Icon: Info, color: "var(--cyan)" },
};

export function NotificationCenter() {
  const { noticeLog, clearNotices, dropNotice } = useApp();

  return (
    <div className="island flex h-full flex-col overflow-hidden">
      <div className="flex h-[28px] shrink-0 items-center gap-2 px-3">
        <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
          Notifications
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
          {noticeLog.length || ""}
        </span>
        {!!noticeLog.length && (
          <button
            onClick={clearNotices}
            data-tip="Clear all"
            className="ml-auto flex size-[18px] items-center justify-center rounded hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-dim)" }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {!noticeLog.length ? (
        <p className="p-3 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Nothing to report. What Flux tells you is kept here until you clear it.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {noticeLog.map((n) => {
            const { Icon, color } = GLYPH[n.kind];
            return (
              <div key={n.id} className="group flex gap-2 px-2 py-1.5 hover:bg-[var(--bg-hover)]">
                <Icon size={13} className="mt-[1px] shrink-0" style={{ color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[12px]" style={{ color: "var(--text)" }}>
                      {n.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {n.at ? new Date(n.at).toLocaleTimeString() : ""}
                    </span>
                  </div>
                  <p className="selectable text-[11px] leading-snug" style={{ color: "var(--text-dim)" }}>
                    {n.message}
                  </p>
                  {!!n.actions?.length && (
                    <div className="mt-1 flex gap-2">
                      {n.actions.map((a) => (
                        <button key={a.label} onClick={a.run} className="text-[11px] hover:underline" style={{ color: "var(--accent)" }}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => dropNotice(n.id)}
                  data-tip="Dismiss"
                  className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-active)]"
                  style={{ color: "var(--text-dim)" }}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
