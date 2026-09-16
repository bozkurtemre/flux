import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Bug, ChevronDown, Database, GitBranch, MoreHorizontal, MoreVertical, PanelRight, Play, Search, Wrench } from "lucide-react";
import { Logo } from "./Logo";
import { useApp } from "@/store";

/** macOS traffic lights are overlaid by Tauri, so the bar keeps 78px clear on the left. */
export function TitleBar() {
  const { setShowSettings, setShowSearch } = useApp();
  const icon = "flex size-7 items-center justify-center rounded-md hover:bg-[var(--bg-hover)]";
  return (
    <div data-tauri-drag-region className="flex h-9 shrink-0 items-center gap-2 pr-1 pl-[78px]">
      <button className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-[var(--bg-hover)]">
        <Logo size={18} radius={40} />
        <span className="text-[13px]">Flux</span>
        <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />
      </button>
      <button className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] hover:bg-[var(--bg-hover)]" style={{ color: "var(--text-dim)" }}>
        Connections
        <ChevronDown size={12} />
      </button>
      <div className="ml-auto flex items-center gap-0.5">
        <button className={icon} title="Settings (⌘,)" onClick={() => setShowSettings(true)}>
          <Wrench size={15} style={{ color: "var(--text-dim)" }} />
        </button>
        <button className={icon}>
          <Bug size={15} style={{ color: "var(--text-dim)" }} />
        </button>
        <button className={icon} title="Search Everywhere (⇧⇧)" onClick={() => setShowSearch(true)}>
          <Search size={15} style={{ color: "var(--text-dim)" }} />
        </button>
        <button className={icon}>
          <MoreVertical size={15} style={{ color: "var(--text-dim)" }} />
        </button>
      </div>
    </div>
  );
}

export function LeftStripe() {
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-1 py-1.5">
      <StripeButton active title="Database Explorer">
        <Database size={16} />
      </StripeButton>
      <StripeButton title="More tool windows">
        <MoreHorizontal size={16} />
      </StripeButton>
      <div className="flex-1" />
      <StripeButton title="Run">
        <Play size={16} style={{ color: "var(--green)" }} />
      </StripeButton>
      <StripeButton title="Version control">
        <GitBranch size={16} />
      </StripeButton>
    </div>
  );
}

export function RightStripe() {
  const { tabs, activeTab, patchTab } = useApp();
  const tab = tabs.find((t) => t.id === activeTab);
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-1 py-1.5">
      <StripeButton
        title="Value inspector"
        active={!!tab?.selectedRow || tab?.selectedRow === 0}
        onClick={() => tab && patchTab(tab.id, { selectedRow: tab.selectedRow == null ? 0 : undefined })}
      >
        <PanelRight size={16} />
      </StripeButton>
    </div>
  );
}

function StripeButton({ children, active, title, onClick }: { children: ReactNode; active?: boolean; title?: string; onClick?: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md"
      style={{ background: active ? "var(--stripe-active)" : undefined, color: "var(--text-dim)" }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "";
      }}
    >
      {children}
    </button>
  );
}

export function StatusBar() {
  const { tabs, activeTab, settings } = useApp();
  const version = useAppVersion();
  const tab = tabs.find((t) => t.id === activeTab);
  const conn = settings.connections.find((c) => c.id === tab?.connId);
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 px-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
      {tab ? (
        <>
          <span className="flex items-center gap-1.5">
            <Database size={11} />
            {conn?.name ?? "—"}
          </span>
          <span className="truncate">{tab.streamLabel}</span>
          {tab.error ? (
            <span style={{ color: "var(--red)" }} className="truncate">
              {tab.error}
            </span>
          ) : tab.page ? (
            <span>
              {tab.page.rows.length} rows · {tab.took} ms
            </span>
          ) : null}
        </>
      ) : (
        <span>Ready</span>
      )}
      <span className="ml-auto">{settings.connections.length} data sources</span>
      {version && <span title="Flux version">v{version}</span>}
    </div>
  );
}

/** The version baked into the bundle, which `make bump-*` keeps in step with the git tag. */
function useAppVersion(): string {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);
  return version;
}
