import { describe, expect, it } from "vitest";
import { offerable, type Manifest } from "./updates";

const at = (iso: string) => new Date(iso);
const manifest = (over: Partial<Manifest> = {}): Manifest => ({ version: "0.3.0", pub_date: "2026-09-17T10:00:00Z", ...over });

describe("offering a published version", () => {
  it("waits out the default soak", () => {
    expect(offerable(manifest(), at("2026-09-17T10:09:00Z"))).toBe(false);
    expect(offerable(manifest(), at("2026-09-17T10:10:00Z"))).toBe(true);
  });

  it("honours the soak the release asked for", () => {
    expect(offerable(manifest({ soakMinutes: 60 }), at("2026-09-17T10:30:00Z"))).toBe(false);
    // zero is how a release says "now", which is how its author tests it
    expect(offerable(manifest({ soakMinutes: 0 }), at("2026-09-17T10:00:00Z"))).toBe(true);
  });

  it("never hides a release because of a field it lacks", () => {
    expect(offerable({ version: "0.3.0" }, at("2026-09-17T10:00:00Z"))).toBe(true);
    expect(offerable(manifest({ pub_date: "not a date" }), at("2026-09-17T10:00:00Z"))).toBe(true);
  });
});
