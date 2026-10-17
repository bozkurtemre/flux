import { describe, expect, it } from "vitest";
import { absorb, deployBefore, emptyLedger, errorQuery, impactOf, listed, rateOf, versionOf, type ErrorLedger, type KnownError } from "./errors";

const at = (iso: string) => new Date(iso).getTime();
const row = (message: string, timestamp: string) => ({ message, timestamp });

describe("the errors a project has had", () => {
  it("takes the first look as what the project already knew, and announces nothing", () => {
    const { ledger, news } = absorb(
      emptyLedger("level:ERROR", "message"),
      [row("payment failed for order 10531", "2026-10-16T10:00:00Z"), row("payment failed for order 10532", "2026-10-16T10:05:00Z")],
      at("2026-10-16T11:00:00Z"),
    );
    expect(news).toEqual([]);
    expect(Object.values(ledger.errors)).toMatchObject([
      { template: "payment failed for order <num>", count: 2, firstSeen: at("2026-10-16T10:00:00Z") },
    ]);
    expect(ledger.checkedTo).toBe(at("2026-10-16T11:00:00Z"));
  });

  it("announces a template it has never had, once, and counts the rest under the ones it had", () => {
    const known = absorb(
      emptyLedger("level:ERROR", "message"),
      [row("payment failed for order 1", "2026-10-16T10:00:00Z")],
      at("2026-10-16T11:00:00Z"),
    ).ledger;
    const { ledger, news } = absorb(
      known,
      [
        row("payment failed for order 2", "2026-10-16T11:01:00Z"),
        row("provider timeout after 30000 ms", "2026-10-16T11:02:00Z"),
        row("provider timeout after 31000 ms", "2026-10-16T11:03:00Z"),
      ],
      at("2026-10-16T11:05:00Z"),
    );
    expect(news.map((e) => [e.template, e.news, e.count])).toEqual([["provider timeout after <num> ms", "new", 2]]);
    expect(ledger.errors["payment failed for order <num>"]).toMatchObject({ count: 2 });
    expect(ledger.errors["payment failed for order <num>"].news).toBeUndefined();
  });

  it("says a resolved error is back when it is seen after it was resolved, and not before", () => {
    const base = absorb(
      emptyLedger("level:ERROR", "message"),
      [row("disk full on node 3", "2026-10-16T09:00:00Z")],
      at("2026-10-16T10:00:00Z"),
    ).ledger;
    const resolved = {
      ...base,
      errors: { "disk full on node <num>": { ...base.errors["disk full on node <num>"], resolvedAt: at("2026-10-16T10:30:00Z") } },
    };
    expect(absorb(resolved, [row("disk full on node 4", "2026-10-16T10:20:00Z")], at("2026-10-16T10:40:00Z")).news).toEqual([]);
    const back = absorb(resolved, [row("disk full on node 5", "2026-10-16T10:45:00Z")], at("2026-10-16T10:50:00Z"));
    expect(back.news).toMatchObject([{ template: "disk full on node <num>", news: "back" }]);
    expect(back.ledger.errors["disk full on node <num>"].resolvedAt).toBeUndefined();
  });

  it("leaves out a row without a message", () => {
    const { ledger } = absorb(emptyLedger("level:ERROR", "message"), [{ timestamp: "2026-10-16T10:00:00Z" }, row("", "2026-10-16T10:00:00Z")], 1);
    expect(ledger.errors).toEqual({});
  });
});

describe("what an error is put down to", () => {
  const merges = [
    { at: "2026-10-16T08:00:00Z", label: "#10 old", url: "u10" },
    { at: "2026-10-16T09:30:00Z", label: "#11 earlier", url: "u11" },
    { at: "2026-10-16T09:50:00Z", label: "#12 latest", url: "u12" },
    { at: "2026-10-16T10:10:00Z", label: "#13 after", url: "u13" },
  ];

  it("is the latest merge in the two hours before it, never one after it", () => {
    expect(deployBefore(merges, at("2026-10-16T10:00:00Z"))?.label).toBe("#12 latest");
    expect(deployBefore(merges, at("2026-10-16T14:00:00Z"))).toBeUndefined();
  });
});

describe("finding an error's lines", () => {
  it("narrows the project's failures to the template's longest literal words", () => {
    expect(errorQuery({ query: "level:ERROR", field: "message" }, "provider order failed for iccid <num>")).toBe(
      '(level:ERROR) AND message:"provider order failed for iccid"',
    );
    expect(errorQuery({ query: "level:ERROR", field: "message" }, "<num> <uuid>")).toBe("level:ERROR");
  });

  it("lists the news first, then the open ones by when they were last seen, the resolved last", () => {
    const e = (template: string, lastSeen: number, extra: Partial<KnownError> = {}): KnownError => ({
      template,
      sample: template,
      firstSeen: 0,
      lastSeen,
      count: 1,
      ...extra,
    });
    expect(listed([e("resolved", 9, { resolvedAt: 5 }), e("old", 1), e("recent", 8), e("new", 2, { news: "new" })]).map((x) => x.template)).toEqual([
      "new",
      "recent",
      "old",
      "resolved",
    ]);
  });
});

describe("an error that is running hot", () => {
  const H = 3_600_000;
  const now = at("2026-10-16T12:30:00Z");
  // two a hour for a day, as a known error that has been there all along
  const steady = (): ErrorLedger => {
    const hours: [number, number][] = Array.from({ length: 24 }, (_, i) => [at("2026-10-15T12:00:00Z") + i * H, 2]);
    const known: KnownError = {
      template: "upstream timeout after <num> ms",
      sample: "",
      firstSeen: at("2026-10-15T12:00:00Z"),
      lastSeen: now - H,
      count: 48,
      hours,
    };
    return { ...emptyLedger("level:ERROR", "message"), checkedTo: now - 5 * 60_000, errors: { [known.template]: known } };
  };
  const burst = (n: number) =>
    Array.from({ length: n }, (_, i) => row(`upstream timeout after ${1000 + i} ms`, new Date(now - i * 60_000).toISOString()));

  it("measures the last hour against the day before it, once it has a day", () => {
    const rate = rateOf(steady().errors["upstream timeout after <num> ms"], now);
    expect(rate?.usual).toBeCloseTo(2, 0);
    expect(rateOf({ firstSeen: now - 2 * H, hours: [] }, now)).toBeNull();
  });

  it("is news when it runs at several times its usual rate, once, and calms down again", () => {
    const hot = absorb(steady(), burst(30), now);
    expect(hot.news).toMatchObject([{ template: "upstream timeout after <num> ms", news: "escalating", escalating: true }]);
    const again = absorb(hot.ledger, burst(3), now + 60_000);
    expect(again.news).toEqual([]);
    const later = absorb(again.ledger, [], now + 3 * H);
    expect(later.ledger.errors["upstream timeout after <num> ms"].escalating).toBe(false);
  });

  it("stays quiet while snoozed, and only escalates while ignored", () => {
    const base = steady();
    const e = base.errors["upstream timeout after <num> ms"];
    const snoozed = { ...base, errors: { [e.template]: { ...e, snoozedUntil: now + H } } };
    expect(absorb(snoozed, burst(30), now).news).toEqual([]);
    const ignored = { ...base, errors: { [e.template]: { ...e, ignored: true } } };
    expect(absorb(ignored, burst(3), now).news).toEqual([]);
    expect(absorb(ignored, burst(30), now).news).toMatchObject([{ news: "escalating" }]);
  });

  it("keeps two days of hours", () => {
    const { ledger } = absorb(steady(), burst(1), now + 40 * H);
    expect(ledger.errors["upstream timeout after <num> ms"].hours?.every(([t]) => t >= now + 40 * H - 49 * H)).toBe(true);
  });
});

describe("who an error hits", () => {
  const lines = [
    { message: "x", route: "/v1/pay", source: "api-1", app_version: "3.4.1", user_id: "u-1001", order_id: "o-2001", took_ms: 12 },
    { message: "x", route: "/v1/pay", source: "api-2", app_version: "3.4.1", user_id: "u-1002", order_id: "o-2002", took_ms: 15 },
    { message: "x", route: "/v1/pay", source: "api-1", app_version: "3.4.1", user_id: "u-1001", order_id: "o-2003", took_ms: 900 },
    { message: "x", route: "/v1/cart", source: "api-1", app_version: "3.4.0", user_id: "u-1003", order_id: "o-2004", took_ms: 20 },
  ];

  it("counts the distinct users and orders, and tells the lines apart by route, host and version first", () => {
    const impact = impactOf(lines, "message");
    expect(impact.affected).toEqual([
      { label: "order id", count: 4 },
      { label: "user id", count: 3 },
    ]);
    expect(impact.tags.map((t) => t.field).slice(0, 3)).toEqual(["route", "source", "app_version"]);
    expect(impact.tags[0].values[0]).toEqual({ value: "/v1/pay", share: 0.75 });
  });

  it("names the version its lines carry most", () => {
    expect(versionOf(lines)).toBe("3.4.1");
    expect(versionOf([{ message: "x" }])).toBeNull();
  });
});
