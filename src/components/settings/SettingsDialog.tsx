import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Button } from "./controls";
import { AdvancedPage, AppearancePage, DataSourcesPage, EditorPage, KeymapPage, ProjectsPage, ResultsPage, type Patch } from "./pages";
import { applyAppearance, DEFAULTS, type Settings } from "@/lib/settings";
import { useApp } from "@/store";

interface PageDef {
  id: string;
  label: string;
  parent?: string;
  keywords: string;
  render: (p: { s: Settings; patch: Patch; reset: () => void; connId?: string }) => React.ReactNode;
}

const PAGES: PageDef[] = [
  {
    id: "appearance",
    label: "Appearance",
    parent: "Appearance & Behavior",
    keywords: "theme dark light accent colour font size density ui",
    render: ({ s, patch }) => <AppearancePage s={s} patch={patch} />,
  },
  {
    id: "tree",
    label: "Database Explorer",
    parent: "Appearance & Behavior",
    keywords: "tree row height indent endpoints sort counts error rate lookback",
    render: ({ s, patch }) => <TreePageLazy s={s} patch={patch} />,
  },
  { id: "keymap", label: "Keymap", keywords: "shortcut keys binding", render: () => <KeymapPage /> },
  {
    id: "editor",
    label: "Query Console",
    parent: "Editor",
    keywords: "editor font line numbers wrap autocomplete lucene run",
    render: ({ s, patch }) => <EditorPage s={s} patch={patch} />,
  },
  {
    id: "results",
    label: "Results Grid",
    parent: "Editor",
    keywords: "grid rows page size timezone timestamp format striped null refresh range",
    render: ({ s, patch }) => <ResultsPage s={s} patch={patch} />,
  },
  {
    id: "projects",
    label: "Projects",
    keywords: "project group stream github repository service",
    render: ({ s, patch }) => <ProjectsPage s={s} patch={patch} />,
  },
  {
    id: "datasources",
    label: "Data Sources",
    keywords: "connection graylog token url env import credential keychain",
    render: ({ s, patch, connId }) => <DataSourcesPage s={s} patch={patch} selectId={connId} />,
  },
  {
    id: "advanced",
    label: "Advanced Settings",
    keywords: "timeout cache reset defaults confirm",
    render: ({ s, patch, reset }) => <AdvancedPage s={s} patch={patch} onReset={reset} />,
  },
];

// pages.tsx exports TreePage; alias keeps the PAGES table readable
import { TreePage as TreePageLazy } from "./pages";

/** The JetBrains Settings window: search, a category tree, a page, and Cancel / Apply / OK. */
export function SettingsDialog() {
  const { settings, setSettings, setShowSettings, settingsPage, settingsConnId } = useApp();
  const [draft, setDraft] = useState<Settings>(settings);
  const [page, setPage] = useState(settingsPage ?? "appearance");
  const [query, setQuery] = useState("");
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);

  // the appearance page previews live, so the window reflects the draft while it is open
  useEffect(() => {
    applyAppearance(draft.appearance);
  }, [draft.appearance]);

  const cancel = () => {
    applyAppearance(settings.appearance);
    setShowSettings(false);
  };
  const apply = async () => {
    await setSettings(draft);
  };
  const ok = async () => {
    await apply();
    setShowSettings(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const needle = query.trim().toLowerCase();
  const matches = (p: PageDef) =>
    !needle || p.label.toLowerCase().includes(needle) || p.keywords.includes(needle) || (p.parent ?? "").toLowerCase().includes(needle);
  const visible = PAGES.filter(matches);
  const current = PAGES.find((p) => p.id === page) ?? visible[0] ?? PAGES[0];

  const groups: { parent?: string; pages: PageDef[] }[] = [];
  for (const p of visible) {
    const last = groups[groups.length - 1];
    if (last && last.parent === p.parent) last.pages.push(p);
    else groups.push({ parent: p.parent, pages: [p] });
  }

  const patch: Patch = (f) => setDraft((d) => f(d));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,.45)" }} onMouseDown={cancel}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[640px] w-[1000px] max-h-[92vh] max-w-[94vw] flex-col overflow-hidden rounded-[10px]"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex h-[38px] shrink-0 items-center px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[13px] font-semibold">Settings</span>
          <button className="ml-auto flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]" onClick={cancel}>
            <X size={14} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[232px] shrink-0 flex-col" style={{ borderRight: "1px solid var(--border)" }}>
            <div className="p-2">
              <div
                className="flex h-[26px] items-center gap-1.5 rounded-[4px] px-2"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}
              >
                <Search size={12} style={{ color: "var(--text-muted)" }} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search settings"
                  spellCheck={false}
                  className="selectable h-full w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
                  style={{ color: "var(--text)" }}
                />
              </div>
            </div>
            <nav className="min-h-0 flex-1 overflow-auto pb-2">
              {groups.map((g, gi) => (
                <div key={g.parent ?? `g${gi}`}>
                  {g.parent && (
                    <div className="flex h-[24px] items-center gap-1 pr-2 pl-3 text-[13px]" style={{ color: "var(--text)" }}>
                      <ChevronRight size={11} style={{ color: "var(--text-dim)", transform: "rotate(90deg)" }} />
                      {g.parent}
                    </div>
                  )}
                  {g.pages.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setPage(p.id)}
                      className="mx-1 flex h-[24px] items-center rounded text-[13px]"
                      style={{
                        paddingLeft: p.parent ? 26 : 10,
                        background: current.id === p.id ? "var(--sel-focus)" : undefined,
                        color: current.id === p.id ? "#fff" : undefined,
                      }}
                    >
                      {p.label}
                    </div>
                  ))}
                </div>
              ))}
              {!visible.length && (
                <p className="px-3 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Nothing matches “{query}”
                </p>
              )}
            </nav>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              className="flex h-[32px] shrink-0 items-center gap-1.5 px-4 text-[12px]"
              style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
            >
              {current.parent && (
                <>
                  <span>{current.parent}</span>
                  <ChevronRight size={11} />
                </>
              )}
              <span style={{ color: "var(--text)" }}>{current.label}</span>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
              {current.render({ s: draft, patch, connId: settingsConnId, reset: () => setDraft({ ...DEFAULTS, connections: draft.connections }) })}
            </div>
          </div>
        </div>

        <div className="flex h-[48px] shrink-0 items-center gap-2 px-4" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {dirty ? "Unsaved changes" : ""}
          </span>
          <div className="ml-auto flex gap-2">
            <Button onClick={cancel}>Cancel</Button>
            <Button onClick={apply} disabled={!dirty}>
              Apply
            </Button>
            <Button primary onClick={ok}>
              OK
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
