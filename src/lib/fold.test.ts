import { describe, expect, it } from "vitest";
import { blocksOf, foldAround, visibleLines } from "./fold";

const text = JSON.stringify(
  {
    timestamp: "2026-09-18T11:00:00Z",
    context: { params: { body: "ok", headers: { a: ["one", "two"] } } },
    level: 3,
  },
  null,
  2,
);

describe("finding the blocks in pretty-printed JSON", () => {
  it("pairs each opening line with the line that closes it", () => {
    const blocks = blocksOf(text);
    const lines = text.split("\n");
    for (const [from, to] of blocks) {
      expect(lines[from]).toMatch(/[[{]\s*$/);
      expect(lines[to].trim()).toMatch(/^[\]}]/);
      expect(to).toBeGreaterThan(from);
    }
    expect(blocks.size).toBe(5); // the row, context, params, headers, and the array in it
  });

  it("leaves a block that is already on one line alone", () => {
    expect(blocksOf('{\n  "a": [1, 2, 3]\n}').size).toBe(1);
  });

  it("is not fooled by a brace inside a string", () => {
    const blocks = blocksOf('{\n  "a": "} not a close {"\n}');
    expect(blocks.get(0)).toBe(2);
    expect(blocks.size).toBe(1);
  });

  it("survives an escaped quote in a string", () => {
    expect(blocksOf('{\n  "a": "he said \\" {"\n}').get(0)).toBe(2);
  });
});

describe("what is on screen once something is folded", () => {
  it("leaves out the lines a fold covers, closing line included", () => {
    const blocks = new Map([
      [1, 5],
      [2, 4],
    ]);
    expect(visibleLines(7, blocks, new Set([1]))).toEqual([0, 1, 6]);
  });

  it("keeps an inner fold folded when the outer one opens", () => {
    const blocks = new Map([
      [1, 5],
      [2, 4],
    ]);
    expect(visibleLines(7, blocks, new Set([2]))).toEqual([0, 1, 2, 5, 6]);
  });

  it("names the fold a hidden line is under, so it can be opened", () => {
    const blocks = new Map([[1, 5]]);
    expect(foldAround(3, blocks, new Set([1]))).toBe(1);
    expect(foldAround(6, blocks, new Set([1]))).toBeNull();
    expect(foldAround(3, blocks, new Set())).toBeNull();
  });
});
