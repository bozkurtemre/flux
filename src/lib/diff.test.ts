import { describe, expect, it } from "vitest";
import { diffRows, flatten, tally } from "./diff";

describe("the leaves of a row", () => {
  it("are named by their path, arrays by their index", () => {
    expect([...flatten({ a: { b: 1, c: [true, { d: "x" }] } })]).toEqual([
      ["a.b", 1],
      ["a.c[0]", true],
      ["a.c[1].d", "x"],
    ]);
  });

  it("counts an empty object as a leaf rather than losing it", () => {
    expect([...flatten({ a: {}, b: [] })]).toEqual([
      ["a", {}],
      ["b", []],
    ]);
  });
});

describe("two rows, side by side", () => {
  const worked = { timestamp: "2026-09-18T11:00:00Z", level: 6, message: JSON.stringify({ status: 200, route: "/v1/wallet", retry: false }) };
  const failed = { timestamp: "2026-09-18T11:00:05Z", level: 3, message: JSON.stringify({ status: 500, route: "/v1/wallet", error: "timeout" }) };

  it("opens a JSON message up and compares what is inside it", () => {
    const lines = diffRows(worked, failed);
    expect(lines.find((l) => l.path === "message.status")).toEqual({ path: "message.status", a: 200, b: 500, change: "changed" });
    expect(lines.find((l) => l.path === "message.route")?.change).toBe("same");
  });

  it("says what only one of them has", () => {
    const lines = diffRows(worked, failed);
    expect(lines.find((l) => l.path === "message.retry")?.change).toBe("removed");
    expect(lines.find((l) => l.path === "message.error")).toEqual({ path: "message.error", b: "timeout", change: "added" });
  });

  it("keeps the first row's order, and puts the second's new leaves after it", () => {
    const paths = diffRows(worked, failed).map((l) => l.path);
    expect(paths.indexOf("message.error")).toBeGreaterThan(paths.indexOf("message.retry"));
    expect(paths[0]).toBe("timestamp");
  });

  it("counts them for the header", () => {
    expect(tally(diffRows(worked, failed))).toEqual({ same: 1, changed: 3, removed: 1, added: 1 });
  });

  it("finds nothing between a row and itself", () => {
    expect(tally(diffRows(worked, worked))).toEqual({ same: 5, changed: 0, removed: 0, added: 0 });
  });
});
