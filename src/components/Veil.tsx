// Back from the Monitor, the explorer's content shimmers a moment, the way the Monitor's does
// while it reads, and gives way to what is there. Only the content: the headings and tabs above
// it stay as they are. Drawn over the content of a `relative` parent, keyed to each return.
import { useApp } from "@/store";

export function Veil({ kind }: { kind: "tree" | "editor" }) {
  const returns = useApp((s) => s.returns);
  if (!returns) return null;
  const bar = (w: string, h: number, indent = 0) => <span className="flux-shimmer block" style={{ width: w, height: h, marginLeft: indent }} />;
  return (
    <div
      key={returns}
      className="flux-veil pointer-events-none absolute inset-0 z-20 flex flex-col gap-2.5 p-3"
      style={{ background: kind === "tree" ? "var(--bg-tool)" : "var(--bg-editor)" }}
      aria-hidden
    >
      {kind === "tree" ? (
        [80, 65, 72, 50, 60, 45, 70, 55].map((w, i) => <span key={i}>{bar(`${w}%`, 9, (i % 3) * 12)}</span>)
      ) : (
        <>
          {bar("100%", 26)}
          {bar("100%", 90)}
          {[95, 88, 92, 80, 90, 85].map((w, i) => (
            <span key={i}>{bar(`${w}%`, 10)}</span>
          ))}
        </>
      )}
    </div>
  );
}
