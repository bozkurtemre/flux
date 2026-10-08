import { describe, expect, it } from "vitest";
import { baselineOf, candidateFields, explain } from "./explain";

describe("the fields worth asking about", () => {
  it("keeps the ones most rows carry with a handful of values, and skips times, ids and text", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      timestamp: `2026-10-08T10:00:0${i}Z`,
      message: `line ${i}`,
      request_id: `r-${i}`,
      app_version: i < 7 ? "3.4.1" : "3.4.0",
      provider: ["a", "b"][i % 2],
      host: "api-1",
      rare: i === 0 ? "x" : undefined,
    }));
    expect(candidateFields(rows)).toEqual(["app_version", "provider"]);
  });

  it("leaves out a field with a different value on every row", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ amount: i, level: i % 2 ? "ERROR" : "INFO" }));
    expect(candidateFields(rows)).toEqual(["level"]);
  });
});

describe("why a stretch is different", () => {
  it("puts first the value whose share moved the most", () => {
    const inside = [
      {
        field: "app_version",
        total: 100,
        values: [
          { value: "3.4.1", count: 90 },
          { value: "3.4.0", count: 10 },
        ],
      },
      {
        field: "provider",
        total: 100,
        values: [
          { value: "x", count: 60 },
          { value: "y", count: 40 },
        ],
      },
    ];
    const before = [
      {
        field: "app_version",
        total: 300,
        values: [
          { value: "3.4.1", count: 30 },
          { value: "3.4.0", count: 270 },
        ],
      },
      {
        field: "provider",
        total: 300,
        values: [
          { value: "x", count: 150 },
          { value: "y", count: 150 },
        ],
      },
    ];
    expect(explain(inside, before)).toEqual([
      { field: "app_version", value: "3.4.1", inside: 0.9, before: 0.1 },
      { field: "provider", value: "x", inside: 0.6, before: 0.5 },
    ]);
  });

  it("counts a value never seen before as having been nothing", () => {
    const inside = [{ field: "error", total: 10, values: [{ value: "TIMEOUT", count: 8 }] }];
    expect(explain(inside, [{ field: "error", total: 50, values: [] }])).toEqual([{ field: "error", value: "TIMEOUT", inside: 0.8, before: 0 }]);
  });

  it("ignores what barely moved, or is too small a part of the stretch to matter", () => {
    const inside = [
      {
        field: "host",
        total: 100,
        values: [
          { value: "a", count: 52 },
          { value: "b", count: 3 },
        ],
      },
    ];
    const before = [
      {
        field: "host",
        total: 100,
        values: [
          { value: "a", count: 50 },
          { value: "b", count: 0 },
        ],
      },
    ];
    expect(explain(inside, before)).toEqual([]);
  });

  it("sets the stretch against the three times as long just before it", () => {
    const b = baselineOf(new Date("2026-10-08T10:10:00Z"), new Date("2026-10-08T10:20:00Z"));
    expect([b.from.toISOString(), b.to.toISOString()]).toEqual(["2026-10-08T09:40:00.000Z", "2026-10-08T10:10:00.000Z"]);
  });
});
