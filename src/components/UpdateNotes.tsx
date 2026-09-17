// What is in the version being offered. The text comes from the manifest, which the release
// workflow fills from the changelog and the commits since the last tag.
import { useApp } from "@/store";
import { Logo } from "./Logo";

export function UpdateNotes() {
  const { showUpdateNotes, setShowUpdateNotes, update, installUpdate } = useApp();
  if (!showUpdateNotes || !update) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.45)" }}
      onMouseDown={() => setShowUpdateNotes(false)}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-[520px] flex-col rounded-[12px] px-6 py-5"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex items-center gap-3">
          <Logo size={28} radius={7} />
          <div>
            <p className="text-[14px] font-semibold">Flux {update.version}</p>
            {update.pub_date && (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Published {new Date(update.pub_date).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <pre
          className="selectable mt-4 min-h-0 flex-1 overflow-auto rounded-[6px] p-3 text-[12px] whitespace-pre-wrap"
          style={{ background: "var(--bg-editor)", border: "1px solid var(--border-soft)", color: "var(--text-dim)" }}
        >
          {update.notes?.trim() || "No release notes were published with this version."}
        </pre>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setShowUpdateNotes(false)}
            className="h-[26px] rounded-[4px] px-3 text-[13px]"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Later
          </button>
          <button
            onClick={() => {
              setShowUpdateNotes(false);
              void installUpdate();
            }}
            className="h-[26px] rounded-[4px] px-3 text-[13px]"
            style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "var(--accent-text)" }}
          >
            Update and Restart
          </button>
        </div>
      </div>
    </div>
  );
}
