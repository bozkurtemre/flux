import { describe, expect, it } from "vitest";
import { codeBlock, csvCell, exportName, toCsv, toJson } from "./export";

const page = {
  columns: ["timestamp", "message", "level"],
  rows: [
    { timestamp: "2026-09-18T11:00:00Z", message: 'he said "no", twice', level: 3 },
    { timestamp: "2026-09-18T11:00:01Z", message: "line\nbreak", level: null },
  ],
};

describe("results as a file", () => {
  it("quotes only what would otherwise be read wrong", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe("");
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("writes the columns on screen, in the order they are on screen", () => {
    const csv = toCsv(page, ["level", "message"]);
    expect(csv.split("\r\n")[0]).toBe("level,message");
    expect(csv.split("\r\n")[1]).toBe('3,"he said ""no"", twice"');
  });

  it("keeps a missing field as null rather than dropping it", () => {
    expect(JSON.parse(toJson(page, ["level", "source"]))).toEqual([
      { level: 3, source: null },
      { level: null, source: null },
    ]);
  });

  it("names the file after the tab and the moment", () => {
    expect(exportName("GET /v1/wallet", "csv", new Date("2026-09-18T11:22:33Z"))).toBe("GET-v1-wallet-2026-09-18-11-22-33.csv");
  });
});

describe("a value on its way into a conversation", () => {
  it("gives Slack bare fences, which is all it reads", () => {
    expect(codeBlock('{\n  "a": 1\n}', "slack")).toBe('```\n{\n  "a": 1\n}\n```');
  });

  it("tells Markdown what the language is", () => {
    expect(codeBlock("{}", "markdown")).toBe("```json\n{}\n```");
  });

  it("uses Jira's own fences", () => {
    expect(codeBlock("{}", "jira")).toBe("{code:json}\n{}\n{code}");
  });

  it("does not leave a blank line inside the fence", () => {
    expect(codeBlock("{}\n\n", "slack")).toBe("```\n{}\n```");
  });
});
