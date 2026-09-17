import { describe, expect, it } from "vitest";
import { findAll, lines, withMatches, type Span } from "./find";

describe("finding text", () => {
  it("finds every occurrence, whatever the case", () => {
    expect(findAll("Error and error and ERROR", "error")).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 15 },
      { start: 20, end: 25 },
    ]);
  });

  it("does not overlap itself, and finds nothing for nothing", () => {
    expect(findAll("aaaa", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    expect(findAll("anything", "")).toEqual([]);
  });
});

describe("marking matches inside coloured tokens", () => {
  const tokens: Span[] = [{ text: '"level"', color: "key" }, { text: ": " }, { text: "200", color: "num" }];

  it("leaves the line alone when nothing matched", () => {
    expect(withMatches(tokens, 0, [])).toBe(tokens);
  });

  it("cuts a token where the match starts and ends, keeping its colour", () => {
    // "eve" inside "level"
    expect(withMatches(tokens, 0, [{ start: 2, end: 5 }])).toEqual([
      { text: '"l', color: "key", match: undefined },
      { text: "eve", color: "key", match: 0 },
      { text: 'l"', color: "key", match: undefined },
      { text: ": ", color: undefined, match: undefined },
      { text: "200", color: "num", match: undefined },
    ]);
  });

  it("splits a match that runs across two tokens rather than losing it", () => {
    // `": 2` starts in the punctuation and ends inside the number
    expect(withMatches(tokens, 0, [{ start: 7, end: 10 }]).filter((s) => s.match === 0)).toEqual([
      { text: ": ", color: undefined, match: 0 },
      { text: "2", color: "num", match: 0 },
    ]);
  });

  it("counts from the line's own place in the text", () => {
    expect(withMatches([{ text: "abc" }], 10, [{ start: 11, end: 12 }]).map((s) => [s.text, s.match])).toEqual([
      ["a", undefined],
      ["b", 0],
      ["c", undefined],
    ]);
  });
});

describe("where each line starts", () => {
  it("counts the newline the split ate, so offsets line up with findAll", () => {
    const text = "ab\ncd\n";
    expect(lines(text)).toEqual([
      { line: "ab", start: 0 },
      { line: "cd", start: 3 },
      { line: "", start: 6 },
    ]);
    // the match findAll reports at 3 is the start of the second line
    expect(findAll(text, "cd")[0].start).toBe(3);
  });
});
