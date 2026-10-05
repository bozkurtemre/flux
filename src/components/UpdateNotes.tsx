// What is in the version being offered. The text comes from the manifest, which the release
// workflow fills from the changelog and the commits since the last tag.
import { markdown, type Inline } from "@/lib/markdown";
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
        <div
          className="selectable mt-4 min-h-0 flex-1 overflow-auto rounded-[6px] p-3 text-[12.5px] leading-[1.55]"
          style={{ background: "var(--bg-editor)", border: "1px solid var(--border-soft)", color: "var(--text-dim)" }}
        >
          {update.notes?.trim() ? <Notes source={update.notes} /> : "No release notes were published with this version."}
        </div>
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

/** The notes as they are meant to read, rather than as they are written. */
export function Notes({ source }: { source: string }) {
  return (
    <>
      {markdown(source).map((block, i) =>
        block.kind === "heading" ? (
          <p key={i} className={i ? "mt-3 mb-1" : "mb-1"} style={{ color: "var(--text)", fontWeight: 600, fontSize: block.level <= 2 ? 14 : 12.5 }}>
            <Text parts={block.text} />
          </p>
        ) : block.kind === "item" ? (
          <p key={i} className="flex gap-2 py-0.5">
            <span style={{ color: "var(--text-muted)" }}>•</span>
            <span>
              <Text parts={block.text} />
            </span>
          </p>
        ) : (
          <p key={i} className="py-1">
            <Text parts={block.text} />
          </p>
        ),
      )}
    </>
  );
}

function Text({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.code ? (
          <code
            key={i}
            className="rounded px-1 font-[var(--font-mono)] text-[11.5px]"
            style={{ background: "var(--bg-raised)", color: "var(--text)" }}
          >
            {part.text}
          </code>
        ) : part.bold ? (
          <strong key={i} style={{ color: "var(--text)", fontWeight: 600 }}>
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
