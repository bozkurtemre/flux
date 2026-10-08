import { describe, expect, it } from "vitest";
import { boolQuery, esFailure, fixedInterval, flatten, groupAggs, groupRows } from "./kibana";

describe("a document as Flux shows it", () => {
  it("flattens nested fields to the dotted names Kibana shows", () => {
    expect(flatten({ log: { level: "ERROR" }, host: { name: "api-1" }, message: "x", tags: ["a", "b"] })).toEqual({
      "log.level": "ERROR",
      "host.name": "api-1",
      message: "x",
      tags: ["a", "b"],
    });
  });
});

describe("what goes to Elasticsearch", () => {
  it("searches the Lucene string inside the window, on the data view's time field", () => {
    expect(boolQuery("level:ERROR", "@timestamp", { type: "absolute", from: "2026-10-07T10:00:00.000Z", to: "2026-10-07T11:00:00.000Z" })).toEqual({
      bool: {
        filter: [
          { query_string: { query: "level:ERROR" } },
          { range: { "@timestamp": { gte: "2026-10-07T10:00:00.000Z", lte: "2026-10-07T11:00:00.000Z", format: "strict_date_optional_time" } } },
        ],
      },
    });
  });

  it("reads an empty search as everything, and a relative window as seconds back from now", () => {
    expect(boolQuery("", "ts", { type: "relative", range: 300 }).bool.filter).toEqual([
      { query_string: { query: "*" } },
      { range: { ts: { gte: "now-300s", lte: "now" } } },
    ]);
  });

  it("asks for a week as seven days, the only unit it reads differently", () => {
    expect(fixedInterval("1w")).toBe("7d");
    expect(fixedInterval("5m")).toBe("5m");
  });

  it("nests one terms per group, with the metrics at the bottom and count left to doc_count", () => {
    const aggs = groupAggs(
      [{ field: "route", limit: 10 }, { field: "method" }],
      [{ function: "count" }, { function: "percentile", field: "responseTime", configuration: { percentile: 95 } }],
      (f) => (f === "route" ? "route.keyword" : f),
    );
    expect(aggs).toEqual({
      g0: {
        terms: { field: "route.keyword", size: 10 },
        aggs: { g1: { terms: { field: "method", size: 500 }, aggs: { m1: { percentiles: { field: "responseTime", percents: [95] } } } } },
      },
    });
  });

  it("refuses a metric it has no translation for, rather than counting instead", () => {
    expect(() => groupAggs([{ field: "a" }], [{ function: "latest", field: "b" }], (f) => f)).toThrow(/latest/);
  });
});

describe("what comes back", () => {
  it("reads nested buckets as rows: the group values, then each metric", () => {
    const aggs = {
      g0: {
        buckets: [
          {
            key: "/v1/wallet",
            doc_count: 7,
            g1: {
              buckets: [
                { key: "GET", doc_count: 5, m1: { values: { "95.0": 1.5 } } },
                { key: "POST", doc_count: 2, m1: { values: { "95.0": null } } },
              ],
            },
          },
        ],
      },
    };
    const metrics = [{ function: "count" }, { function: "percentile", field: "t" }];
    expect(groupRows(aggs, 2, metrics)).toEqual([
      ["/v1/wallet", "GET", 5, 1.5],
      ["/v1/wallet", "POST", 2, null],
    ]);
  });

  it("has no rows for no buckets", () => {
    expect(groupRows({}, 1, [{ function: "count" }])).toEqual([]);
  });
});

describe("a failure Kibana passes on", () => {
  it("is read out of the body, since the proxy answers 200 either way", () => {
    expect(
      esFailure({ error: { type: "search_phase_execution_exception", root_cause: [{ reason: "Failed to parse query [a:(]" }] }, status: 400 }),
    ).toEqual({
      status: 400,
      reason: "Failed to parse query [a:(]",
    });
    expect(esFailure({})).toBeNull();
  });
});
