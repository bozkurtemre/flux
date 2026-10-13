import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Button, Indexing } from "./controls";
import { findAll } from "@/lib/find";
import {
  AccountPage,
  AdvancedPage,
  AppearancePage,
  ConnectionsPage,
  EditorPage,
  JiraPage,
  KeymapPage,
  ProjectsPage,
  ResultsPage,
  TerminalPage,
  McpPage,
  UpdatesPage,
  WorkspacePage,
  type Patch,
} from "./pages";
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
    id: "account",
    label: "Account",
    keywords: "account sign in sign out email profile sync cloud preferences delete supabase",
    render: ({ s }) => <AccountPage s={s} />,
  },
  {
    id: "appearance",
    label: "Appearance",
    parent: "Appearance & Behavior",
    keywords: "theme dark light accent colour font size density ui",
    render: ({ s, patch }) => <AppearancePage s={s} patch={patch} />,
  },
  {
    id: "tree",
    label: "Connection Explorer",
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
    id: "terminal",
    label: "Terminal",
    keywords: "terminal tmux shell session pty path quit persist",
    render: ({ s, patch }) => <TerminalPage s={s} patch={patch} />,
  },
  {
    id: "projects",
    label: "Projects",
    keywords: "project group stream github repository service",
    render: ({ s, patch }) => <ProjectsPage s={s} patch={patch} />,
  },
  {
    id: "updates",
    label: "Updates",
    keywords: "update upgrade version release check startup",
    render: ({ s, patch }) => <UpdatesPage s={s} patch={patch} />,
  },
  {
    id: "mcp",
    label: "MCP Server",
    keywords: "mcp server agent claude code tools port token",
    render: ({ s, patch }) => <McpPage s={s} patch={patch} />,
  },
  {
    id: "workspace",
    label: "Workspace",
    keywords: "workspace folder project directory flux connections",
    render: ({ s, patch }) => <WorkspacePage s={s} patch={patch} />,
  },
  {
    id: "connections",
    label: "Connections",
    keywords: "connection graylog token url env import credential keychain",
    render: ({ s, patch, connId }) => <ConnectionsPage s={s} patch={patch} selectId={connId} />,
  },
  {
    id: "jira",
    label: "Jira",
    keywords: "jira issue ticket atlassian bug create project",
    render: ({ s, patch }) => <JiraPage s={s} patch={patch} />,
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

/** The name the search's marks are painted under, styled in index.css. */
const MARK = "settings-search";

/** The words of a page, each text apart from the next, so two labels never run into one word. */
function textOf(el: Element): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.textContent ?? "");
  return parts.join(" ");
}

/** A label with what was searched for marked in it, the way the page's own text is. */
function Marked({ text, needle }: { text: string; needle: string }) {
  const found = needle ? findAll(text, needle) : [];
  if (!found.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const m of found) {
    out.push(text.slice(at, m.start));
    out.push(
      <span key={m.start} className="settings-mark">
        {text.slice(m.start, m.end)}
      </span>,
    );
    at = m.end;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

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

  // project folders live in the workspace rather than in the draft, so Cancel has to put
  // them back itself for this window to mean what it says
  const foldersOnOpen = useRef(useApp.getState().projectFolders);
  const cancel = () => {
    applyAppearance(settings.appearance);
    useApp.getState().setProjectFolders(foldersOnOpen.current);
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

  // what each page says, read once from the pages themselves, so a search finds a setting by
  // the words on it and not only by the name of the page it is on
  const [index, setIndex] = useState<Record<string, string> | null>(null);
  const indexer = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (index) return;
    const frame = requestAnimationFrame(() => {
      const el = indexer.current;
      if (el) setIndex(Object.fromEntries([...el.children].map((c) => [c.getAttribute("data-page") ?? "", textOf(c).toLowerCase()])));
    });
    return () => cancelAnimationFrame(frame);
  }, [index]);

  const needle = query.trim().toLowerCase();
  const matches = (p: PageDef) =>
    !needle ||
    p.label.toLowerCase().includes(needle) ||
    p.keywords.includes(needle) ||
    (p.parent ?? "").toLowerCase().includes(needle) ||
    !!index?.[p.id]?.includes(needle);
  const visible = PAGES.filter(matches);
  const chosen = PAGES.find((p) => p.id === page) ?? PAGES[0];
  // a search that leaves the open page out moves to the first one it found, as the IDE does
  const current = needle && !visible.includes(chosen) ? (visible[0] ?? chosen) : chosen;

  // what was searched for, marked on the page where it stands, without touching what React drew
  useEffect(() => {
    const el = body.current;
    const registry = typeof CSS !== "undefined" ? CSS.highlights : undefined;
    if (!el || !registry || typeof Highlight === "undefined") return;
    const paint = (reveal: boolean) => {
      registry.delete(MARK);
      if (!needle) return;
      const ranges: Range[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        for (const m of findAll(n.textContent ?? "", needle)) {
          const r = new Range();
          r.setStart(n, m.start);
          r.setEnd(n, m.end);
          ranges.push(r);
        }
      }
      if (!ranges.length) return;
      registry.set(MARK, new Highlight(...ranges));
      if (reveal) ranges[0].startContainer.parentElement?.scrollIntoView({ block: "center" });
    };
    paint(true);
    // the page changes under the marks as it is used; they are put back where the text now is
    const watch = new MutationObserver(() => paint(false));
    watch.observe(el, { subtree: true, childList: true, characterData: true });
    return () => {
      watch.disconnect();
      registry.delete(MARK);
    };
  }, [needle, current.id]);

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
                {/* the marks follow the query, so emptying it takes them off the pages too */}
                {query && (
                  <button
                    onClick={(e) => {
                      setQuery("");
                      (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.focus();
                    }}
                    data-tip="Clear"
                    aria-label="Clear the search"
                    className="flex size-[16px] shrink-0 items-center justify-center rounded-full hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            <nav className="min-h-0 flex-1 overflow-auto pb-2">
              {groups.map((g, gi) => (
                <div key={g.parent ?? `g${gi}`}>
                  {g.parent && (
                    <div className="flex h-[24px] items-center gap-1 pr-2 pl-3 text-[13px]" style={{ color: "var(--text)" }}>
                      <ChevronRight size={11} style={{ color: "var(--text-dim)", transform: "rotate(90deg)" }} />
                      <Marked text={g.parent} needle={needle} />
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
                      <Marked text={p.label} needle={needle} />
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
            <div ref={body} className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
              {current.render({ s: draft, patch, connId: settingsConnId, reset: () => setDraft({ ...DEFAULTS, connections: draft.connections }) })}
            </div>
            {/* every page once, out of sight, to read what it says; gone as soon as it is read */}
            {!index && (
              <Indexing.Provider value={true}>
                <div ref={indexer} hidden aria-hidden>
                  {PAGES.map((p) => (
                    <div key={p.id} data-page={p.id}>
                      {p.render({ s: draft, patch: () => {}, connId: settingsConnId, reset: () => {} })}
                    </div>
                  ))}
                </div>
              </Indexing.Provider>
            )}
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
