import { describe, expect, it } from "vitest";
import { filter, parse } from "liqe";
import { bucketsOf, groupRowsBy, metricOf, percentile, toLiqe, unitMs } from "./local";

const rows = [
  { message: "Provider order failed", level: "ERROR", httpStatusCode: 502, route: "/v1/orders/1", took: 1.2 },
  { message: "ok", level: "INFO", httpStatusCode: 200, route: "/v1/wallet", took: 0.1 },
  { message: "timeout talking to provider", level: "WARN", httpStatusCode: 504, took: 3.0 },
];
const search = (q: string) => filter(parse(toLiqe(q)), rows).map((r) => r.httpStatusCode);

describe("the console's Lucene, over rows in memory", () => {
  it("reads fields, ranges, boolean operators and bare text", () => {
    expect(search("level:ERROR")).toEqual([502]);
    expect(search("httpStatusCode:>=500 AND NOT level:WARN")).toEqual([502]);
    expect(search("(level:ERROR OR level:WARN)")).toEqual([502, 504]);
    expect(search("provider")).toEqual([502, 504]);
    expect(search("")).toEqual([502, 200, 504]);
  });

  it("reads _exists_, and a route with its slashes, escaped or not, wildcard and all", () => {
    expect(toLiqe("_exists_:route")).toBe("route:*");
    expect(search("_exists_:route")).toEqual([502, 200]);
    expect(search("route:/v1/orders*")).toEqual([502]);
    // what an endpoint console writes
    expect(search("route:\\/v1\\/orders*")).toEqual([502]);
    expect(search('route:"/v1/wallet"')).toEqual([200]);
    expect(search("-route:/v1/wallet")).toEqual([502, 504]);
  });

  it("reads a field over a group of values, as the error query writes it", () => {
    expect(search("level:(ERROR OR WARN)")).toEqual([502, 504]);
    expect(search('level:(ERROR OR "INFO") AND httpStatusCode:>=500')).toEqual([502]);
    expect(search("httpStatusCode:>=500 OR level:(INFO)").sort()).toEqual([200, 502, 504]);
  });
});

describe("counting in memory", () => {
  it("answers the metrics the other sources do", () => {
    expect(metricOf(rows, { function: "count" })).toBe(3);
    expect(metricOf(rows, { function: "card", field: "level" })).toBe(3);
    expect(metricOf(rows, { function: "max", field: "took" })).toBe(3);
    expect(metricOf(rows, { function: "percentile", field: "took", configuration: { percentile: 50 } })).toBe(1.2);
    expect(metricOf(rows, { function: "avg", field: "message" })).toBeNull();
    expect(() => metricOf(rows, { function: "latest", field: "x" })).toThrow(/latest/);
  });

  it("takes the percentile by nearest rank", () => {
    expect(percentile([5, 1, 3, 2, 4], 95)).toBe(5);
    expect(percentile([5, 1, 3, 2, 4], 40)).toBe(2);
    expect(percentile([], 95)).toBeNull();
  });

  it("groups by the values of fields, most first, leaving out rows without one", () => {
    expect(groupRowsBy([...rows, { level: "ERROR", route: "/x" }], ["level"]).map((g) => [g.key, g.rows.length])).toEqual([
      [["ERROR"], 2],
      [["INFO"], 1],
      [["WARN"], 1],
    ]);
    expect(groupRowsBy(rows, ["route"]).length).toBe(2);
  });

  it("buckets times at a fixed width, quiet buckets between included", () => {
    expect(unitMs("5m")).toBe(300_000);
    const t = Date.parse("2026-10-12T10:00:00Z");
    const buckets = bucketsOf([t + 1000, t + 61_000, t + 185_000], "1m");
    expect(buckets.map((b) => [new Date(b.at).toISOString(), b.indexes])).toEqual([
      ["2026-10-12T10:00:00.000Z", [0]],
      ["2026-10-12T10:01:00.000Z", [1]],
      ["2026-10-12T10:02:00.000Z", []],
      ["2026-10-12T10:03:00.000Z", [2]],
    ]);
  });
});
