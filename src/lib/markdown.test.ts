import { describe, expect, it } from "vitest";
import { inline, markdown } from "./markdown";

describe("reading a release note", () => {
  it("keeps a bullet that wraps across lines as one bullet", () => {
    // the changelog wraps at eighty columns, which a line-per-block reader would tear apart
    const blocks = markdown("- **Find in the value inspector.** `⌘F` while a row\n  is open searches the JSON.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("item");
    expect(blocks[0].text.map((t) => t.text).join("")).toBe("Find in the value inspector. ⌘F while a row is open searches the JSON.");
  });

  it("separates headings, bullets and paragraphs", () => {
    expect(markdown("### Added\n\n- one\n- two\n\nPlain words.").map((b) => b.kind)).toEqual(["heading", "item", "item", "paragraph"]);
    expect(markdown("## Fixed").map((b) => ("level" in b ? b.level : 0))).toEqual([2]);
  });

  it("marks bold and code, and leaves everything else alone", () => {
    expect(inline("a **b** c `d`")).toEqual([{ text: "a " }, { text: "b", bold: true }, { text: " c " }, { text: "d", code: true }]);
    expect(inline("nothing special")).toEqual([{ text: "nothing special" }]);
  });
});
