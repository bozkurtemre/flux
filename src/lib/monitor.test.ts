import { describe, expect, it } from "vitest";
import { digest, durationOf, errorQueryFrom, levelOf, mergeTail, percentile } from "./monitor";

describe("errorQueryFrom", () => {
  it("reads a level that is a word, and a status", () => {
    expect(errorQueryFrom([{ level_name: "INFO", httpStatusCode: 200 }])).toBe(
      "level_name:(ERROR OR error OR CRITICAL OR critical OR ALERT OR EMERGENCY OR FATAL OR fatal) OR httpStatusCode:>=500",
    );
  });

  it("reads a numeric level as syslog's", () => {
    expect(errorQueryFrom([{ level: 6 }, { level: "3" }])).toBe("level:<=3");
  });

  it("has nothing to count by when the lines carry neither", () => {
    expect(errorQueryFrom([{ message: "hello" }])).toBeNull();
  });
});

describe("mergeTail", () => {
  const key = (r: Record<string, unknown>) => String(r.id);
  it("puts the fresh lines on top, once each, and drops what fell out of the window", () => {
    const tail = [
      { id: 2, timestamp: "2026-10-13T12:00:02Z" },
      { id: 1, timestamp: "2026-10-13T11:00:00Z" },
    ];
    const fresh = [
      { id: 3, timestamp: "2026-10-13T12:00:03Z" },
      { id: 2, timestamp: "2026-10-13T12:00:02Z" },
    ];
    expect(mergeTail(tail, fresh, key, Date.parse("2026-10-13T11:30:00Z")).map((r) => r.id)).toEqual([3, 2]);
  });
});

describe("the numbers", () => {
  it("takes seconds unless the field says milliseconds", () => {
    expect(durationOf({ responseTime: 0.25 })).toBe(250);
    expect(durationOf({ took_ms: 40 })).toBe(40);
    expect(durationOf({ message: "x" })).toBeNull();
  });

  it("finds a percentile", () => {
    expect(percentile([10, 20, 30, 40, 1000], 95)).toBe(1000);
    expect(percentile([], 95)).toBeNull();
  });

  it("names syslog levels as people say them", () => {
    expect(levelOf({ level: 3 })).toBe("ERROR");
    expect(levelOf({ level_name: "warning" })).toBe("WARNING");
  });

  it("digests the tail", () => {
    const rows = [
      { source: "api-1", streams: ["a"], level_name: "ERROR", message: "Charge failed for order 1842", took_ms: 900 },
      { source: "api-1", streams: ["a"], level_name: "ERROR", message: "Charge failed for order 1907", took_ms: 800 },
      { source: "api-2", streams: ["b"], level_name: "INFO", message: "ok", took_ms: 20 },
    ];
    const d = digest(rows, (r) => String((r.streams as string[])[0]));
    expect(d.failed).toBe(2);
    expect(d.sources).toBe(2);
    expect(d.streams[0]).toEqual({ name: "a", count: 2, failed: 2 });
    expect(d.failures[0].count).toBe(2);
  });
});
