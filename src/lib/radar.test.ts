import { describe, expect, it } from "vitest";
import { onRadar, radarLine, worse } from "./radar";

describe("the deploy radar", () => {
  it("puts the rate before the merge beside the rate since", () => {
    expect(radarLine({ total: 1000, errors: 4 }, { total: 500, errors: 3 }, 3 * 60_000)).toBe("errors 0.4% → 0.6% · 3m since merge");
  });

  it("calls it worse only with enough failures to mean something", () => {
    expect(worse({ total: 1000, errors: 4 }, { total: 100, errors: 2 })).toBe(false);
    expect(worse({ total: 1000, errors: 4 }, { total: 500, errors: 20 })).toBe(true);
    expect(worse({ total: 1000, errors: 40 }, { total: 500, errors: 22 })).toBe(false);
  });

  it("watches for ten minutes", () => {
    const at = "2026-10-14T10:00:00Z";
    expect(onRadar(at, Date.parse(at) + 9 * 60_000)).toBe(true);
    expect(onRadar(at, Date.parse(at) + 11 * 60_000)).toBe(false);
  });
});
