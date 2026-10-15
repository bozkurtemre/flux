import { describe, expect, it } from "vitest";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { applyValue } from "./complete";

/** The line after picking `value` for the typed part between `from` and the cursor. */
function pick(doc: string, cursor: number, from: number, value: string, quoted: boolean) {
  let state = EditorState.create({ doc, selection: { anchor: cursor } });
  const view = {
    get state() {
      return state;
    },
    dispatch: (spec: TransactionSpec) => void (state = state.update(spec).state),
  } as unknown as EditorView;
  applyValue(value, quoted)(view, { label: value }, from, cursor);
  return { line: state.doc.toString(), cursor: state.selection.main.head };
}

describe("a picked value in the console", () => {
  it("closes the quotes it was typed in, taking the closing quote already there", () => {
    expect(pick('route:"/use"', 11, 7, "/user/scenario/package", true)).toEqual({ line: 'route:"/user/scenario/package"', cursor: 30 });
  });

  it("closes them itself when there was none, and escapes what needs it", () => {
    expect(pick('message:"say', 12, 9, 'say "hi"', true)).toEqual({ line: 'message:"say \\"hi\\""', cursor: 20 });
  });

  it("is quoted whole after a bare colon, and leaves the rest of the line alone", () => {
    expect(pick("os:we AND level:ERROR", 5, 3, "web", false)).toEqual({ line: 'os:"web" AND level:ERROR', cursor: 8 });
  });
});
