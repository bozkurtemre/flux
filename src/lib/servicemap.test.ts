import { describe, expect, it } from "vitest";
import { buildMap, layout } from "./servicemap";

const at = (s: number) => new Date(Date.parse("2026-10-12T10:00:00Z") + s * 1000).toISOString();
const rows = [
  // one request: gateway, then orders (Laravel keeps the id in its context), then the provider, which failed
  { timestamp: at(0), streams: "gateway", request_id: "r1", httpStatusCode: 502 },
  { timestamp: at(0.1), streams: "orders", "context.request_id": "r1", level: "INFO" },
  { timestamp: at(0.2), streams: "provider", request_id: "r1", level: "error" },
  { timestamp: at(9), streams: "orders", "context.request_id": "r1", level: "ERROR" },
  // another: gateway, orders, provider, all well
  { timestamp: at(10), streams: "gateway", request_id: "r2", httpStatusCode: 200 },
  { timestamp: at(10.3), streams: "orders", "context.request_id": "r2", level: "INFO" },
  { timestamp: at(10.4), streams: "orders", "context.request_id": "r2", level: "INFO" },
  { timestamp: at(10.5), streams: "provider", request_id: "r2", level: "info" },
  // a wallet that only ever speaks alone
  { timestamp: at(20), streams: "wallet", level: "INFO" },
];

describe("the map of some logs", () => {
  const map = buildMap(rows, (s) => s.toUpperCase());

  it("joins the services by the id most of them carry, wherever each keeps it", () => {
    expect(map.joinedBy).toBe("request id");
  });

  it("draws each step of a request as an edge, the failures on its far side counted", () => {
    const edges = map.edges.map((e) => [e.from, e.to, e.count, e.errors]);
    expect(edges).toEqual([
      ["gateway", "orders", 2, 1],
      ["orders", "provider", 2, 1],
      ["provider", "orders", 1, 1],
    ]);
    expect(map.edges.find((e) => e.to === "provider")?.sample).toBe("r1");
  });

  it("counts each service's lines and failures, and keeps the ones that join nothing", () => {
    expect(map.nodes.map((n) => [n.id, n.label, n.lines, n.errors]).sort()).toEqual([
      ["gateway", "GATEWAY", 2, 1],
      ["orders", "ORDERS", 4, 1],
      ["provider", "PROVIDER", 2, 1],
      ["wallet", "WALLET", 1, 0],
    ]);
  });

  it("lays the services out left to right by how early in a request they speak", () => {
    expect(map.layers).toEqual([["gateway", "wallet"], ["orders"], ["provider"]]);
    const at = layout(map, 600, 300);
    expect(at.get("gateway")!.x).toBeLessThan(at.get("orders")!.x);
    expect(at.get("orders")!.x).toBeLessThan(at.get("provider")!.x);
  });

  it("is redrawn for a stretch of time from the same rows", () => {
    const later = buildMap(rows, (s) => s, { from: Date.parse(at(9.5)), to: Date.parse(at(30)) });
    expect(later.edges.map((e) => [e.from, e.to, e.errors])).toEqual([
      ["gateway", "orders", 0],
      ["orders", "provider", 0],
    ]);
  });
});
