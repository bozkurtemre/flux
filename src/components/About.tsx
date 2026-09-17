// Our own About window. The system's panel takes its icon from the app bundle, which a
// development build has none of, and its credits are plain text with nowhere to click.
import { useEffect, useState } from "react";
import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Logo } from "./Logo";
import { useApp } from "@/store";

const AUTHOR = "https://github.com/bozkurtemre";

export function About() {
  const { showAbout, setShowAbout } = useApp();
  const [version, setVersion] = useState("");
  const open = showAbout;
  const setOpen = setShowAbout;
  const [tauri, setTauri] = useState("");

  useEffect(() => {
    if (open) {
      void getVersion().then(setVersion);
      void getTauriVersion().then(setTauri);
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  /** What a bug report needs and nobody can be expected to look up by hand. */
  const report = () =>
    [`Flux ${version || "unknown"}`, `Tauri ${tauri || "unknown"}`, navigator.userAgent, `Language: ${navigator.language}`].join("\n");

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.45)" }}
      onMouseDown={() => setOpen(false)}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex w-[320px] flex-col items-center rounded-[12px] px-6 pt-9 pb-5"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        {/* as the system panel has them: only closing is available, so only that one is lit */}
        <div className="absolute top-3.5 left-3.5 flex gap-2">
          <button onClick={() => setOpen(false)} title="Close" className="size-3 rounded-full" style={{ background: "#ff5f57" }} />
          <span className="size-3 rounded-full" style={{ background: "var(--bg-raised)" }} />
          <span className="size-3 rounded-full" style={{ background: "var(--bg-raised)" }} />
        </div>
        <Logo size={72} radius={16} />
        <p className="mt-4 text-[15px] font-semibold">Flux</p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-dim)" }}>
          {version ? `Version ${version}` : ""}
        </p>
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-dim)" }}>
          Designed and Developed by{" "}
          <button onClick={() => void openUrl(AUTHOR)} className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
            Emre Bozkurt
          </button>
        </p>
        <div className="mt-6 flex w-full justify-end gap-2">
          <button
            onClick={() => {
              void navigator.clipboard.writeText(report()).finally(() => setOpen(false));
            }}
            title="Copy the version details a bug report needs"
            className="h-[26px] rounded-[4px] px-3 text-[13px]"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Copy and Close
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-[26px] rounded-[4px] px-4 text-[13px]"
            style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "var(--accent-text)" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
