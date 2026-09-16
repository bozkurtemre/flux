import { describe, expect, it } from "vitest";
import { inferMapping, requestFilter, sortEndpoints, type EndpointRow } from "./endpoints";

const f = (...names: string[]) => names.map((name) => ({ name, type: "string" }));

describe("field mapping", () => {
  it("finds the route, method, status and duration a stream happens to use", () => {
    expect(inferMapping(f("route", "method", "httpStatusCode", "responseTime"))).toEqual({
      route: "route",
      method: "method",
      status: "httpStatusCode",
      duration: "responseTime",
      durationIsSeconds: true,
    });
  });

  it("treats a *_ms name as milliseconds and everything else as seconds", () => {
    expect(inferMapping(f("uri", "took_ms"))?.durationIsSeconds).toBe(false);
    expect(inferMapping(f("uri", "responseTime"))?.durationIsSeconds).toBe(true);
  });

  it("returns null when the stream carries no route field", () => {
    expect(inferMapping(f("message", "level", "caller"))).toBeNull();
  });

  it("works with nothing but a route", () => {
    expect(inferMapping(f("path"))).toEqual({
      route: "path",
      method: undefined,
      status: undefined,
      duration: undefined,
      durationIsSeconds: false,
    });
  });
});

describe("sorting", () => {
  const rows: EndpointRow[] = [
    { endpoint: "/b", method: "GET", requests: 10, errors: 5, errorRatePct: 50, p95Ms: null },
    { endpoint: "/a", method: "GET", requests: 100, errors: 1, errorRatePct: 1, p95Ms: null },
  ];

  it("orders by traffic, by error rate or by name", () => {
    expect(sortEndpoints(rows, "traffic").map((r) => r.endpoint)).toEqual(["/a", "/b"]);
    expect(sortEndpoints(rows, "errors").map((r) => r.endpoint)).toEqual(["/b", "/a"]);
    expect(sortEndpoints(rows, "name").map((r) => r.endpoint)).toEqual(["/a", "/b"]);
  });
});

describe("request filter", () => {
  it("prefers a duration field, since a line with one is a finished request", () => {
    expect(requestFilter({ route: "route", duration: "responseTime", durationIsSeconds: true })).toBe("_exists_:responseTime");
  });

  it("falls back to the status field, then to everything", () => {
    expect(requestFilter({ route: "route", status: "httpStatusCode", durationIsSeconds: false })).toBe("_exists_:httpStatusCode");
    expect(requestFilter({ route: "route", durationIsSeconds: false })).toBe("*");
  });
});
