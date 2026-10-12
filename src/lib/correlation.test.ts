import { describe, expect, it } from "vitest";
import { correlationOf, identifying, pairOnLine } from "./correlation";

describe("what is worth following", () => {
  it("takes a dash for the empty field it is", () => {
    expect(identifying("-")).toBe(false);
    expect(identifying("")).toBe(false);
    expect(identifying("null")).toBe(false);
    expect(identifying("0")).toBe(false);
    expect(identifying("8931080019")).toBe(true);
  });
});

describe("the field a row is followed by", () => {
  it("prefers a trace over everything else it carries", () => {
    const row = { requestId: "req-1", trace_id: "abc123", order_id: "77" };
    expect(correlationOf(row)).toEqual({ field: "trace_id", value: "abc123" });
  });

  it("falls to the next name when the first is empty", () => {
    expect(correlationOf({ trace_id: "-", requestId: "req-1" })).toEqual({ field: "requestId", value: "req-1" });
  });

  it("follows the column that was pointed at, whatever it is called", () => {
    const row = { trace_id: "abc123", iccid: "8931080019" };
    expect(correlationOf(row, "iccid")).toEqual({ field: "iccid", value: "8931080019" });
  });

  it("ignores the pointed-at column when there is nothing in it", () => {
    expect(correlationOf({ trace_id: "abc123", level: "" }, "level")?.field).toBe("trace_id");
  });

  it("finds nothing rather than following a message", () => {
    expect(correlationOf({ timestamp: "2026-09-18T11:00:00Z", message: "it broke" })).toBeNull();
  });
});

describe("the line under the pointer", () => {
  it("reads the key and the value off a pair", () => {
    expect(pairOnLine('  "requestId": "abc-123",')).toEqual({ key: "requestId", value: "abc-123" });
    expect(pairOnLine('  "httpStatusCode": 500')).toEqual({ key: "httpStatusCode", value: "500" });
  });

  it("undoes JSON's escaping, so what is searched is what was logged", () => {
    expect(pairOnLine('  "message": "he said \\"no\\""')?.value).toBe('he said "no"');
  });

  it("has nothing to offer on a line that only opens a block", () => {
    expect(pairOnLine('  "context": {')).toBeNull();
    expect(pairOnLine("  }")).toBeNull();
  });

  it("takes an element of an array as a value of its own", () => {
    expect(pairOnLine('    "one",')).toEqual({ value: "one" });
  });
});

describe("an id kept inside something else", () => {
  it("is found by its own name, as Laravel keeps it in the context", () => {
    expect(correlationOf({ "context.request_id": "abc123", "context.order_id": "ord-1" })).toEqual({ field: "context.request_id", value: "abc123" });
  });
});
