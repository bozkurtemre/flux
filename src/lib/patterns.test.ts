import { describe, expect, it } from "vitest";
import { fieldsOf, messageField, patternsOf, templateOf } from "./patterns";

describe("the template a message is counted under", () => {
  it("takes out what differs every time", () => {
    expect(templateOf("Activation failed for iccid=8931080019 after 3 tries")).toBe("Activation failed for iccid=<num> after <num> tries");
    expect(templateOf("Stream 550e8400-e29b-41d4-a716-446655440000 is gone")).toBe("Stream <uuid> is gone");
    expect(templateOf("Reply to a.user+tag@example.com from 10.0.12.7")).toBe("Reply to <email> from <ip>");
    expect(templateOf("Started at 2026-09-18T11:00:00.123Z")).toBe("Started at <time>");
  });

  it("counts a run of masks as one, so a version is not four numbers", () => {
    expect(templateOf("build 1.2.3 of 2026")).toBe("build <num> of <num>");
  });

  it("leaves what makes the line what it is", () => {
    expect(templateOf("  Wallet   balance mismatch  ")).toBe("Wallet balance mismatch");
  });

  it("holds a long line to something a table can show", () => {
    expect(templateOf("x".repeat(400))).toHaveLength(300);
  });
});

describe("the patterns in a page of rows", () => {
  const rows = [
    { message: "timeout for order 11" },
    { message: "timeout for order 12" },
    { message: "timeout for order 13" },
    { message: "balance mismatch" },
    { message: "" },
    { level: "ERROR" },
  ];

  it("counts the same line once, commonest first", () => {
    expect(patternsOf(rows)).toEqual([
      { template: "timeout for order <num>", count: 3, sample: "timeout for order 11" },
      { template: "balance mismatch", count: 1, sample: "balance mismatch" },
    ]);
  });

  it("keeps a row with nothing in that field out of the count", () => {
    expect(patternsOf(rows).reduce((a, p) => a + p.count, 0)).toBe(4);
  });

  it("counts another field when asked", () => {
    expect(patternsOf(rows, "level")).toEqual([{ template: "ERROR", count: 1, sample: "ERROR" }]);
  });
});

describe("which field carries the message", () => {
  it("prefers the one Graylog calls message", () => {
    expect(messageField(["timestamp", "message", "full_message"])).toBe("message");
    expect(messageField(["timestamp", "log_msg"])).toBe("log_msg");
    expect(messageField(["timestamp", "source"])).toBe("source");
  });
});

describe("the fields in a page of rows", () => {
  const rows = [
    { level: "ERROR", source: "api-1", route: "/a" },
    { level: "ERROR", source: "api-2", route: "/a" },
    { level: "WARN", source: "api-1" },
    { level: "", source: "api-1" },
  ];

  it("counts how many rows carry each field, best covered first", () => {
    const fields = fieldsOf(rows);
    expect(fields.map((f) => [f.name, f.filled])).toEqual([
      ["source", 4],
      ["level", 3],
      ["route", 2],
    ]);
  });

  it("names the commonest values, with their counts", () => {
    const level = fieldsOf(rows).find((f) => f.name === "level");
    expect(level?.top).toEqual([
      { value: "ERROR", count: 2 },
      { value: "WARN", count: 1 },
    ]);
  });

  it("keeps the list of values to the few worth showing", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `v${i}` }));
    expect(fieldsOf(many)[0].top).toHaveLength(5);
  });
});
