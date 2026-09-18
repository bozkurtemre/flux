import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Settings2, SunMoon, FoldVertical, History, RefreshCw } from "lucide-react";
import { ConnectionIcon, EndpointIcon, ProjectIcon, StreamIcon } from "./icons";
import { useApp, type TreeNode } from "@/store";

type Tab = "all" | "streams" | "endpoints" | "projects" | "queries" | "actions";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "projects", label: "Projects" },
  { id: "streams", label: "Streams" },
  { id: "endpoints", label: "Endpoints" },
  { id: "queries", label: "Queries" },
  { id: "actions", label: "Actions" },
];

interface Hit {
  key: string;
  group: string;
  title: string;
  sub?: string;
  trailing?: string;
  score: number;
  icon: React.ReactNode;
  run: () => void;
}

/** JetBrains "Search Everywhere": tabs, one big field, grouped results, keyboard hints. */
export function SearchEverywhere() {
  const app = useApp();
  const { nodes, settings, indexing, indexAll, setShowSearch, openTab, revealNode, setShowSettings, searchTab } = app;
  const [tab, setTab] = useState<Tab>((searchTab as Tab) ?? "all");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void indexAll();
  }, [indexAll]);

  const actions: Hit[] = useMemo(
    () => [
      {
        key: "a:settings",
        group: "Actions",
        title: "Open Settings",
        trailing: "⌘,",
        score: 0,
        icon: <Settings2 size={14} style={{ color: "var(--text-dim)" }} />,
        run: () => setShowSettings(true),
      },
      {
        key: "a:theme",
        group: "Actions",
        title: `Switch to ${settings.appearance.theme === "light" ? "dark" : "light"} theme`,
        score: 0,
        icon: <SunMoon size={14} style={{ color: "var(--text-dim)" }} />,
        run: () =>
          void useApp
            .getState()
            .setSettings({ ...settings, appearance: { ...settings.appearance, theme: settings.appearance.theme === "light" ? "dark" : "light" } }),
      },
      {
        key: "a:collapse",
        group: "Actions",
        title: "Collapse all in Connection Explorer",
        score: 0,
        icon: <FoldVertical size={14} style={{ color: "var(--text-dim)" }} />,
        run: () => useApp.setState({ expanded: {} }),
      },
      {
        key: "a:reindex",
        group: "Actions",
        title: "Refresh all connections",
        score: 0,
        icon: <RefreshCw size={13} style={{ color: "var(--text-dim)" }} />,
        run: () => void useApp.getState().refreshAll(),
      },
    ],
    [settings, setShowSettings],
  );

  const hits = useMemo(() => {
    const q = query.trim();
    const out: Hit[] = [];
    const connName = (id: string) => settings.connections.find((c) => c.id === id)?.name ?? "";

    const push = (n: TreeNode) => {
      const isEndpoint = n.kind === "endpoint";
      const haystack = isEndpoint ? `${n.endpoint?.method ?? ""} ${n.label}` : n.label;
      const score = match(q, haystack) ?? (n.sub ? match(q, n.sub) : null);
      if (score == null) return;
      out.push({
        key: n.id,
        group: n.kind === "project" ? "Projects" : n.kind === "stream" ? "Streams" : n.kind === "endpoint" ? "Endpoints" : "Connections",
        title: n.label,
        sub: isEndpoint ? streamNameOf(n, nodes) : n.sub,
        trailing: connName(n.connId),
        score,
        icon:
          n.kind === "connection" ? (
            <ConnectionIcon live />
          ) : n.kind === "project" ? (
            <ProjectIcon />
          ) : n.kind === "stream" ? (
            <StreamIcon />
          ) : (
            <EndpointIcon tone={n.endpoint && n.endpoint.errorRatePct >= 5 ? "bad" : n.endpoint && n.endpoint.errorRatePct >= 1 ? "warn" : "ok"} />
          ),
        run: () => {
          if (n.kind === "endpoint" || n.kind === "stream") openTab(n);
          revealNode(n.id);
        },
      });
    };

    // what has been run, which is usually what is being looked for again
    if (tab === "all" || tab === "queries") {
      for (const h of app.history) {
        const score = match(q, h.query || "*") ?? match(q, h.streamLabel);
        if (score == null) continue;
        out.push({
          key: `h:${h.id}`,
          group: "Queries",
          title: h.query || "*",
          sub: h.streamLabel,
          trailing: h.rows != null ? `${h.rows.toLocaleString()} rows` : "",
          score,
          icon: <History size={13} style={{ color: "var(--text-dim)" }} />,
          run: () => app.openHistory(h.id),
        });
      }
    }

    const wanted: TreeNode["kind"][] =
      tab === "streams"
        ? ["stream"]
        : tab === "endpoints"
          ? ["endpoint"]
          : tab === "projects"
            ? ["project"]
            : tab === "actions" || tab === "queries"
              ? []
              : ["connection", "project", "stream", "endpoint"];

    if (tab !== "actions" && tab !== "queries") for (const n of Object.values(nodes)) if (wanted.includes(n.kind)) push(n);

    if (tab === "all" || tab === "actions") {
      for (const a of actions) {
        const score = match(q, a.title);
        if (score != null) out.push({ ...a, score });
      }
    }

    const order = ["Actions", "Queries", "Connections", "Projects", "Streams", "Endpoints"];
    return out.sort((a, b) => b.score - a.score || order.indexOf(a.group) - order.indexOf(b.group) || a.title.localeCompare(b.title)).slice(0, 60);
  }, [query, tab, nodes, actions, settings.connections, openTab, revealNode, app]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="1"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor, hits]);

  const choose = (h: Hit | undefined) => {
    if (!h) return;
    h.run();
    setShowSearch(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setShowSearch(false);
    if (e.key === "ArrowDown") return (e.preventDefault(), setCursor((c) => Math.min(hits.length - 1, c + 1)));
    if (e.key === "ArrowUp") return (e.preventDefault(), setCursor((c) => Math.max(0, c - 1)));
    if (e.key === "Enter") return (e.preventDefault(), choose(hits[cursor]));
    if (e.key === "Tab") {
      e.preventDefault();
      const i = TABS.findIndex((t) => t.id === tab);
      setTab(TABS[(i + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length].id);
      setCursor(0);
    }
  };

  // group consecutive hits under their section header
  const sections: { group: string; items: Hit[] }[] = [];
  for (const h of hits) {
    const last = sections[sections.length - 1];
    if (last && last.group === h.group) last.items.push(h);
    else sections.push({ group: h.group, items: [h] });
  }
  let flat = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center pt-[12vh]"
      style={{ background: "rgba(0,0,0,.35)" }}
      onMouseDown={() => setShowSearch(false)}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        className="flex h-[480px] w-[720px] max-w-[92vw] flex-col overflow-hidden rounded-[10px]"
        style={{ background: "var(--bg-tool)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,.55)" }}
      >
        <div className="flex h-[34px] shrink-0 items-center gap-1 px-2" style={{ borderBottom: "1px solid var(--border)" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setCursor(0);
              }}
              className="h-[24px] rounded px-2.5 text-[12px]"
              style={{ background: tab === t.id ? "var(--bg-raised)" : "transparent", color: tab === t.id ? "var(--text)" : "var(--text-dim)" }}
            >
              {t.label}
            </button>
          ))}
          {indexing && (
            <span className="ml-auto pr-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              indexing…
            </span>
          )}
        </div>

        <div className="flex h-[46px] shrink-0 items-center gap-2.5 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <Search size={17} style={{ color: "var(--text-muted)" }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            spellCheck={false}
            placeholder="Search streams, endpoints and actions"
            className="selectable h-full w-full bg-transparent text-[16px] outline-none placeholder:text-[var(--text-muted)]"
            style={{ color: "var(--text)" }}
          />
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-auto py-1">
          {hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
              {indexing ? "Indexing connections…" : query ? `Nothing matches “${query}”` : "Type to search"}
            </p>
          ) : (
            sections.map((sec) => (
              <div key={sec.group}>
                <div className="px-4 pt-2 pb-1 text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  {sec.group}
                </div>
                {sec.items.map((h) => {
                  flat++;
                  const active = flat === cursor;
                  const index = flat;
                  return (
                    <div
                      key={h.key}
                      data-active={active ? "1" : "0"}
                      onMouseMove={() => setCursor(index)}
                      onClick={() => choose(h)}
                      className="mx-1 flex h-[28px] items-center gap-2.5 rounded px-3"
                      style={{ background: active ? "var(--sel-focus)" : undefined, color: active ? "#fff" : undefined }}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">{h.icon}</span>
                      <span className="truncate text-[13px]" style={{ fontFamily: h.group === "Endpoints" ? "var(--font-mono)" : undefined }}>
                        {h.title}
                      </span>
                      {h.sub && (
                        <span className="truncate text-[11px]" style={{ color: active ? "#cfe0ff" : "var(--text-muted)" }}>
                          {h.sub}
                        </span>
                      )}
                      {h.trailing && (
                        <span className="ml-auto shrink-0 pl-3 text-[11px]" style={{ color: active ? "#cfe0ff" : "var(--text-muted)" }}>
                          {h.trailing}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          className="flex h-[28px] shrink-0 items-center gap-4 px-4 text-[11px]"
          style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>⇥ switch tab</span>
          <span>esc close</span>
          <span className="ml-auto">{hits.length} results</span>
        </div>
      </div>
    </div>
  );
}

function streamNameOf(n: TreeNode, nodes: Record<string, TreeNode>): string | undefined {
  return nodes[`s:${n.connId}:${n.streamId}`]?.label;
}

/**
 * IDE-style scoring: an exact prefix beats a word start, which beats a loose subsequence.
 * Returns null when the query does not appear at all.
 */
export function match(query: string, text: string): number | null {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - t.length;
  const at = t.indexOf(q);
  if (at >= 0) return (/[\s/:._-]/.test(t[at - 1] ?? " ") ? 700 : 500) - at;
  // subsequence
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length ? 200 - t.length : null;
}
