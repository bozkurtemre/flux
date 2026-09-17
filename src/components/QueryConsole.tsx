import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
// Graylog speaks Lucene; the solr mode covers the same field:value, range and boolean syntax
import { solr } from "@codemirror/legacy-modes/mode/solr";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Play, RotateCw } from "lucide-react";
import { QUICK_RANGES } from "@/lib/graylog";
import { useApp, type Tab } from "@/store";

const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--syn-key)" },
  { tag: tags.string, color: "var(--syn-str)" },
  { tag: tags.number, color: "var(--syn-num)" },
  { tag: tags.keyword, color: "var(--purple)", fontWeight: "600" },
  { tag: tags.operator, color: "var(--syn-op)" },
  { tag: tags.comment, color: "var(--syn-comment)", fontStyle: "italic" },
]);

export function QueryConsole({ tab }: { tab: Tab }) {
  const { patchTab, runQuery, settings } = useApp();
  const e = settings.editor;

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
        ],
      };
    };
    return [
      StreamLanguage.define(solr),
      syntaxHighlighting(highlight),
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
        <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
        <select
          value={tab.rangeSeconds}
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
