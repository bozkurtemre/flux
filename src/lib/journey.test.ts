import { describe, expect, it } from "vitest";
import { isFailure, journeyOf, position } from "./journey";

describe("a line that reports a failure", () => {
  it("reads a level by name or by the syslog number Graylog keeps", () => {
    expect(isFailure({ level: "ERROR" })).toBe(true);
    expect(isFailure({ "log.level": "warning" })).toBe(false);
    expect(isFailure({ level: 3 })).toBe(true);
    expect(isFailure({ level: "6" })).toBe(false);
  });

  it("falls back to the response status", () => {
    expect(isFailure({ httpStatusCode: 502 })).toBe(true);
    expect(isFailure({ status: "404" })).toBe(false);
    expect(isFailure({ message: "fine" })).toBe(false);
  });
});

describe("one id across every stream", () => {
  const rows = [
    { timestamp: "2026-10-08T10:00:00.000Z", streams: ["orders"], order_id: "ord-81", message: "created ord-81", level: "INFO" },
    { timestamp: "2026-10-08T10:00:02.000Z", streams: ["provider"], ref: "ORD-81", message: "activation requested", level: "INFO" },
    { timestamp: "2026-10-08T10:00:09.000Z", streams: ["provider"], ref: "ORD-81", message: "timeout", level: "ERROR" },
    { timestamp: "not a time", streams: ["orders"], order_id: "ord-81" },
  ];

  it("tells it as lanes, the stream that spoke first leading, with the failures counted", () => {
    const j = journeyOf(rows, "ord-81")!;
    expect(j.lanes.map((l) => [l.stream, l.points.map((p) => p.index), l.errors])).toEqual([
      ["orders", [0], 0],
      ["provider", [1, 2], 1],
    ]);
    expect([j.from, j.to]).toEqual([Date.parse("2026-10-08T10:00:00Z"), Date.parse("2026-10-08T10:00:09Z")]);
  });

  it("names the fields the id was found in, whatever its case, most often first", () => {
    expect(journeyOf(rows, "ord-81")!.foundIn).toEqual([
      { field: "ref", count: 2 },
      { field: "message", count: 1 },
      { field: "order_id", count: 1 },
    ]);
  });

  it("has no story without a line that says when", () => {
    expect(journeyOf([{ timestamp: "", streams: "x" }], "x")).toBeNull();
  });

  it("places an instant along the lane, and a single instant in the middle", () => {
    expect(position(15, 10, 20)).toBe(50);
    expect(position(20, 10, 20)).toBe(100);
    expect(position(10, 10, 10)).toBe(50);
  });
});
