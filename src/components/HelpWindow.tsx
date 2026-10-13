// The Help menu, answered. Its pages are read here rather than off a website: the getting
// started tour and the query language are written for this app, and the changelog is the one
// the build was made from, so What's New always describes the version that is running.
import { useEffect, useState } from "react";
import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { appConfigDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import changelog from "../../CHANGELOG.md?raw";
import { Notes } from "./UpdateNotes";
import { GETTING_STARTED, QUERY_LANGUAGE, reportUrl } from "@/lib/help";
import { failureReason } from "@/lib/progress";
import { useApp } from "@/store";

type Page = "start" | "query" | "whats-new";

const TITLES: Record<Page, string> = { start: "Getting started", query: "Query language", "whats-new": "What's new in Flux" };

/** What a bug report needs to be read, and nothing that belongs to the person sending it. */
export async function diagnostics(): Promise<string> {
  const { settings, tabs } = useApp.getState();
  const [version, tauri] = await Promise.all([getVersion().catch(() => "?"), getTauriVersion().catch(() => "?")]);
  return [
    `Flux ${version} · Tauri ${tauri}`,
    navigator.userAgent,
    `Connections: ${settings.connections.length} · Projects: ${settings.projects.length} · Open tabs: ${tabs.length}`,
    `Terminal: ${settings.terminal.engine} · MCP server: ${settings.mcp.enabled ? "on" : "off"} · Timeline: ${settings.results.timeline ? "on" : "off"}`,
  ].join("\n");
}

/** A GitHub issue opened in the browser, with the diagnostics already in it. */
export function reportProblem(): Promise<void> {
  return diagnostics().then((d) => openUrl(reportUrl(d)));
}

export function HelpWindow() {
  const [page, setPage] = useState<Page | null>(null);

  // the menu's items arrive as one event, named by what was chosen
  useEffect(() => {
    const app = useApp.getState();
    const pending = listen<string>("help", (event) => {
      const what = event.payload;
      if (what === "start" || what === "query" || what === "whats-new") return setPage(what);
      if (what === "find-action") return app.setShowSearch(true, "actions");
      if (what === "tour") return app.setShowTour(true);
      if (what === "shortcuts") return app.setShowSettings(true, "keymap");
      if (what === "report") return void reportProblem();
      if (what === "diagnostics") {
        return void diagnostics()
          .then((d) => navigator.clipboard.writeText(d))
          .then(() => app.notify("info", "Diagnostic info copied", "The version, the platform and how Flux is set up, without names or tokens."));
      }
      if (what === "settings-folder" || what === "cache-folder") {
        const where = what === "settings-folder" ? appConfigDir() : invoke<string>("cache_location");
        void where.then((dir) => revealItemInDir(dir)).catch((e: unknown) => app.notify("error", "Could not show the folder", failureReason(e)));
      }
    });
    return () => void pending.then((stop) => stop());
  }, []);

  useEffect(() => {
    if (!page) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPage(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page]);

  if (!page) return null;
  return (
    <div
      data-modal
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.45)" }}
      onMouseDown={() => setPage(null)}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[76vh] w-[680px] max-w-[92vw] flex-col overflow-hidden rounded-[10px]"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex h-[38px] shrink-0 items-center gap-1 px-3" style={{ borderBottom: "1px solid var(--border)" }}>
          {(Object.keys(TITLES) as Page[]).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className="h-[24px] rounded px-2 text-[12px]"
              style={{ background: page === p ? "var(--bg-active)" : undefined, color: page === p ? "var(--text)" : "var(--text-dim)" }}
            >
              {TITLES[p]}
            </button>
          ))}
          <button onClick={() => setPage(null)} className="ml-auto flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]">
            <X size={14} />
          </button>
        </div>
        <div className="selectable min-h-0 flex-1 overflow-auto px-6 py-4 text-[12.5px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          <Notes source={page === "start" ? GETTING_STARTED : page === "query" ? QUERY_LANGUAGE : changelog} />
        </div>
      </div>
    </div>
  );
}
