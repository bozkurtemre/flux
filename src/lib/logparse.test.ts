import { describe, expect, it } from "vitest";
import { isoOf, parseLine, parseLog } from "./logparse";

describe("one line of a log", () => {
  it("reads JSON, with the time, level and message under Flux's names", () => {
    expect(parseLine('{"ts":1760263200,"lvl":"error","msg":"provider timeout","ctx":{"iccid":"8990"}}')).toEqual({
      ts: 1760263200,
      lvl: "error",
      msg: "provider timeout",
      "ctx.iccid": "8990",
      timestamp: "2025-10-12T10:00:00.000Z",
      level: "error",
      message: "provider timeout",
    });
  });

  it("reads Laravel's line and the context after the message", () => {
    expect(parseLine('[2026-10-12 10:00:00] production.ERROR: Provider order failed {"iccid":"8990","attempt":2} []')).toMatchObject({
      env: "production",
      level: "ERROR",
      message: "Provider order failed",
      "context.iccid": "8990",
      "context.attempt": 2,
    });
  });

  it("reads logfmt", () => {
    expect(parseLine('time=2026-10-12T10:00:00Z level=warn msg="slow provider" took=2314ms')).toMatchObject({
      level: "warn",
      message: "slow provider",
      took: "2314ms",
      timestamp: "2026-10-12T10:00:00.000Z",
    });
  });

  it("reads a date, a level and the rest", () => {
    expect(parseLine("2026-10-12 10:00:00,123 [ERROR] connection refused")).toMatchObject({ level: "ERROR", message: "connection refused" });
    expect(parseLine("2026-10-12T10:00:00Z INFO started")).toEqual({ timestamp: "2026-10-12T10:00:00.000Z", level: "INFO", message: "started" });
  });

  it("is nothing on its own when it has no time: it continues the line before", () => {
    expect(parseLine("    at App\\Jobs\\Order->handle() line 42")).toBeNull();
  });
});

describe("a stretch of a log", () => {
  it("joins a stack trace onto its message, and carries the stream, an id and a time", () => {
    const rows = parseLog(
      "2026-10-12T10:00:00Z ERROR boom\n  at a()\n  at b()\n2026-10-12T10:00:05Z INFO ok\n",
      "api/app.log",
      "2026-10-12T09:00:00Z",
    );
    expect(rows).toEqual([
      {
        timestamp: "2026-10-12T10:00:00.000Z",
        level: "ERROR",
        message: "boom\n  at a()\n  at b()",
        streams: "api/app.log",
        source: "api/app.log",
        _id: "api/app.log:1",
      },
      { timestamp: "2026-10-12T10:00:05.000Z", level: "INFO", message: "ok", streams: "api/app.log", source: "api/app.log", _id: "api/app.log:4" },
    ]);
  });

  it("gives a line with no time of its own the time before it, or the file's", () => {
    const rows = parseLog("just a line\n", "x.log", "2026-10-12T09:00:00.000Z");
    expect(rows[0]).toMatchObject({ message: "just a line", timestamp: "2026-10-12T09:00:00.000Z" });
  });

  it("takes Docker's time off the front, and keeps the writer's own when it has one", () => {
    const prefix = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\s/;
    const rows = parseLog(
      '2026-10-12T10:00:00.123456789Z {"level":"info","message":"hi"}\n2026-10-12T10:00:01.000000000Z plain text\n',
      "web",
      "2026-10-12T09:00:00Z",
      { prefix },
    );
    expect(rows.map((r) => [r.timestamp, r.message])).toEqual([
      ["2026-10-12T10:00:00.123Z", "hi"],
      ["2026-10-12T10:00:01.000Z", "plain text"],
    ]);
  });
});

describe("a time", () => {
  it("is read from epoch seconds and milliseconds, and from a date with a comma", () => {
    expect(isoOf(1760263200)).toBe("2025-10-12T10:00:00.000Z");
    expect(isoOf("1760263200000")).toBe("2025-10-12T10:00:00.000Z");
    expect(isoOf("2026-10-12T10:00:00,5Z")).toBe("2026-10-12T10:00:00.500Z");
    expect(isoOf("soon")).toBeNull();
  });
});

describe("pairs inside a plain line", () => {
  it("are fields as well, the message kept whole", () => {
    expect(parseLine('2026-10-12T10:00:00Z ERROR wallet topup request_id=ab12 amount=10 note="two words"')).toEqual({
      timestamp: "2026-10-12T10:00:00.000Z",
      level: "ERROR",
      message: 'wallet topup request_id=ab12 amount=10 note="two words"',
      request_id: "ab12",
      amount: "10",
      note: "two words",
    });
  });
});
