import { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Decoration, EditorView, MatchDecorator, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
// Graylog speaks Lucene; the solr mode covers the same field:value, range and boolean syntax
import { solr } from "@codemirror/legacy-modes/mode/solr";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Download, Play, Radio, RotateCw, Save } from "lucide-react";
import { QUICK_RANGES } from "@/lib/graylog";
import { exportName, toCsv, toJson } from "@/lib/export";
import { parseQuery } from "@/lib/query";
import { failureReason } from "@/lib/progress";
import { unsaved } from "@/lib/queries";
import { useApp, type Tab } from "@/store";

/** The results as they are on screen, written where the save dialog says. */
function exportItems(tab: Tab): MenuItem[] {
  const columns = tab.layout?.length ? tab.layout : (tab.page?.columns ?? []);
  const write = async (format: "csv" | "json") => {
    if (!tab.page) return;
    const path = await saveDialog({ defaultPath: exportName(tab.title, format) });
    if (!path) return;
    const contents = format === "csv" ? toCsv(tab.page, columns) : toJson(tab.page, columns);
    await invoke("save_file", { path, contents });
    useApp.getState().notify("info", "Export", `${tab.page.rows.length.toLocaleString()} rows written.`);
  };
  const run = (format: "csv" | "json") => () =>
    void write(format).catch((e: unknown) => useApp.getState().notify("error", "Export", failureReason(e)));
  return [
    { label: "Export as CSV", icon: <Download size={12} />, onClick: run("csv") },
    { label: "Export as JSON", icon: <Download size={12} />, onClick: run("json") },
  ];
}

const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--syn-key)" },
  { tag: tags.string, color: "var(--syn-str)" },
  { tag: tags.number, color: "var(--syn-num)" },
  { tag: tags.keyword, color: "var(--purple)", fontWeight: "600" },
  { tag: tags.operator, color: "var(--syn-op)" },
  { tag: tags.comment, color: "var(--syn-comment)", fontStyle: "italic" },
]);

// `group by` is ours rather than Lucene's, so the solr mode does not know it; it is marked
// on top of whatever that mode made of those words.
const clause = new MatchDecorator({
  regexp: /(?:^|\|)\s*(?:group\s*by|between\s+\S+\s+and)\b/gi,
  decoration: Decoration.mark({ class: "cm-clause" }),
});

const clauses = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = clause.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = clause.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

export function QueryConsole({ tab }: { tab: Tab }) {
  const { patchTab, runQuery, settings, saveActiveQuery, savedQueries, toggleFollow } = useApp();
  const [exporting, setExporting] = useState<{ x: number; y: number } | null>(null);
  const e = settings.editor;
  const dirty = unsaved(tab, savedQueries);
  // a line that names its own window is the one deciding, so the quick ranges step aside
  const pinned = !!parseQuery(tab.query).between;

  const extensions = useMemo(() => {
    const fieldNames = tab.fields.map((f) => f.name);
    const complete = (ctx: CompletionContext) => {
      const word = ctx.matchBefore(/[\w.]*/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;
      return {
        from: word.from,
        options: [
          ...fieldNames.map((name) => ({ label: name, type: "property", apply: `${name}:` })),
          ...["AND", "OR", "NOT", "TO", "_exists_"].map((label) => ({ label, type: "keyword" })),
          { label: "group by", type: "keyword", apply: "group by " },
          { label: "between", type: "keyword", apply: "between " },
        ],
      };
    };
    return [
      StreamLanguage.define(solr),
      syntaxHighlighting(highlight),
      clauses,
      EditorView.theme({ ".cm-clause": { color: "var(--accent)", fontWeight: "600" } }),
      autocompletion({ override: [complete], activateOnTyping: e.autocomplete }),
      EditorView.theme({ "&": { fontSize: `${e.fontSize}px` } }),
      ...(e.wrap ? [EditorView.lineWrapping] : []),
      // above the default keymap, which binds Mod-Enter to inserting a blank line: without
      // the precedence it wins, and running the query leaves a new line behind every time
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              void runQuery(tab.id);
              return true;
            },
          },
        ]),
      ),
    ];
  }, [tab.fields, tab.id, runQuery, e.autocomplete, e.fontSize, e.wrap]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[30px] shrink-0 items-center gap-1 px-1.5">
        <button
          onClick={() => void runQuery(tab.id)}
          data-tip="Execute"
          data-tip-key="⌘⏎"
          className="flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
        >
          {tab.running ? (
            <RotateCw size={13} className="animate-spin" style={{ color: "var(--text-dim)" }} />
          ) : (
            <Play size={14} style={{ color: "var(--green)" }} fill="var(--green)" />
          )}
        </button>
        <button
          onClick={() => void runQuery(tab.id)}
          disabled={tab.running}
          data-tip="Refresh"
          data-tip-key="⌘R"
          className="flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <RotateCw size={13} style={{ color: "var(--text-dim)" }} />
        </button>
        <button
          onClick={() => saveActiveQuery()}
          data-tip={dirty ? "Save query — edited since it was saved" : "Save query"}
          data-tip-key="⌘S"
          className="relative flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
        >
          <Save size={13} style={{ color: dirty ? "var(--accent)" : "var(--text-dim)" }} />
        </button>
        <button
          onClick={() => toggleFollow(tab.id)}
          disabled={pinned}
          data-tip={pinned ? "A window that does not move has nothing to follow" : tab.follow ? "Following new messages" : "Follow new messages"}
          className="flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <Radio size={13} className={tab.follow ? "animate-pulse" : undefined} style={{ color: tab.follow ? "var(--green)" : "var(--text-dim)" }} />
        </button>
        <button
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setExporting({ x: r.left, y: r.bottom + 4 });
          }}
          disabled={!tab.page?.rows.length}
          data-tip="Export results"
          className="flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <Download size={13} style={{ color: "var(--text-dim)" }} />
        </button>
        {exporting && <ContextMenu x={exporting.x} y={exporting.y} items={exportItems(tab)} onClose={() => setExporting(null)} />}
        <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
        <select
          value={tab.rangeSeconds}
          disabled={pinned}
          data-tip={pinned ? "This console searches the window its query names" : undefined}
          onChange={(e) => {
            patchTab(tab.id, { rangeSeconds: Number(e.target.value) });
            void runQuery(tab.id);
          }}
          className="h-6 rounded px-1 text-[12px] outline-none"
          style={{ background: "var(--bg-raised)", color: "var(--text)", border: "1px solid var(--border)" }}
        >
          {QUICK_RANGES.map((r) => (
            <option key={r.seconds} value={r.seconds}>
              Last {r.label}
            </option>
          ))}
        </select>
        {tab.endpoint && (
          <span className="ml-1 truncate rounded px-1.5 py-0.5 text-[11px]" style={{ background: "var(--bg-raised)", color: "var(--text-dim)" }}>
            scoped to {tab.endpoint.method} {tab.endpoint.endpoint}
          </span>
        )}
        <span className="ml-auto pr-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          | group by field · ⌘⏎ to run
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <CodeMirror
          value={tab.query}
          onChange={(v) => patchTab(tab.id, { query: v })}
          extensions={extensions}
          basicSetup={{
            lineNumbers: e.lineNumbers,
            foldGutter: false,
            highlightActiveLine: e.highlightActiveLine,
            autocompletion: false,
            bracketMatching: true,
            closeBrackets: true,
          }}
          placeholder="Lucene query, e.g.  level_name:ERROR AND httpStatusCode:>=500"
          theme="none"
        />
      </div>
    </div>
  );
}
