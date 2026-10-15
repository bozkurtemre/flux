// The console's completion: field names and keywords where a term goes, and after `field:` the
// values that field takes, picked into place quoted the way the console writes values.
import { pickedCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { quotedValue, valueAt } from "./query";

/**
 * Puts a picked value in place, quoted the way the console writes values: inside quotes already
 * typed it is escaped and closes them, taking the closing quote that was typed with them, so the
 * cursor lands after the value, ready for what comes next.
 */
export const applyValue = (value: string, quoted: boolean) => (view: EditorView, completion: Completion, from: number, to: number) => {
  const closing = quoted && view.state.sliceDoc(to, to + 1) === '"';
  const insert = quoted ? quotedValue(value).slice(1) : quotedValue(value);
  view.dispatch({
    changes: { from, to: closing ? to + 1 : to, insert },
    selection: { anchor: from + insert.length },
    annotations: pickedCompletion.of(completion),
  });
};

/**
 * The completion source for the console. `valuesOf` answers with a field's values and how often
 * each occurs; a field it has none for offers nothing, rather than field names where a value goes.
 */
export function consoleCompletion(fieldNames: string[], valuesOf: (field: string) => Promise<{ value: string; count: number }[]>) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    // after field: the values the field takes, not more field names
    const line = ctx.state.doc.lineAt(ctx.pos);
    const at = valueAt(ctx.state.sliceDoc(line.from, ctx.pos));
    if (at && at.field === "_exists_") {
      return { from: line.from + at.from, options: fieldNames.map((name) => ({ label: name, type: "property" })) };
    }
    if (at) {
      const values = await valuesOf(at.field);
      if (!values.length) return null;
      return {
        from: line.from + at.from,
        // the source answers most frequent first; among values that match equally, it stays so
        options: values.map(({ value, count }, i) => ({
          label: value,
          detail: count.toLocaleString(),
          type: "constant",
          boost: Math.round(50 - (100 * i) / values.length),
          apply: applyValue(value, at.quoted),
        })),
        // typing on inside the value narrows these; leaving it asks again
        validFor: at.quoted ? /^(?:[^"\\]|\\.)*$/ : /^[^\s"()[\]{}]*$/,
      };
    }
    const word = ctx.matchBefore(/[\w.]*/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    return {
      from: word.from,
      options: [
        ...fieldNames.map((name) => ({ label: name, type: "property", apply: `${name}:` })),
        ...["AND", "OR", "NOT", "TO", "_exists_"].map((label) => ({ label, type: "keyword" })),
        { label: "group by", type: "keyword", apply: "group by " },
        { label: "between", type: "keyword", apply: "between " },
        { label: "patterns", type: "keyword", apply: "patterns" },
      ],
    };
  };
}
