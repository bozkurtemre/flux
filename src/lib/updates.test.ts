import { describe, expect, it } from "vitest";
import { changelogSection, compareVersions, forced, notesSince, offerable, type Manifest } from "./updates";

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

describe("a forced update", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const manifest = { version: "0.25.0", pub_date: "2026-10-12T11:00:00Z", minimumVersion: "0.24.0" };

  it("compares versions as numbers, not text", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("0.23.0", "0.24.0")).toBe(-1);
  });

  it("holds a copy older than the minimum, and lets one at or past it through", () => {
    expect(forced(manifest, "0.23.0", now)).toBe(true);
    expect(forced(manifest, "0.24.0", now)).toBe(false);
    expect(forced(manifest, "0.25.0", now)).toBe(false);
    expect(forced({ version: "0.25.0" }, "0.1.0", now)).toBe(false);
  });

  it("waits out the soak like any other release, so it can still be withdrawn", () => {
    expect(forced({ ...manifest, pub_date: "2026-10-12T11:55:00Z" }, "0.23.0", now)).toBe(false);
  });

  it("shows every release since the running one, newest first", () => {
    const history = [
      { version: "0.25.0", notes: "c" },
      { version: "0.24.0", notes: "b", forced: true },
      { version: "0.23.0", notes: "a" },
    ];
    expect(notesSince({ ...manifest, history }, "0.23.0").map((h) => h.version)).toEqual(["0.25.0", "0.24.0"]);
    expect(notesSince({ version: "0.25.0", notes: "only this" }, "0.23.0")).toEqual([{ version: "0.25.0", notes: "only this" }]);
  });
});

describe("a version's changelog", () => {
  const changelog = "# Changelog\n\nIntro.\n\n## 0.23.0\n\n### Added\n\n- **Explain a spike.**\n\n## 0.22.0\n\n- Kibana.\n";

  it("is its own section, up to the next version", () => {
    expect(changelogSection(changelog, "0.23.0")).toEqual({ version: "0.23.0", notes: "### Added\n\n- **Explain a spike.**" });
    expect(changelogSection(changelog, "v0.22.0")).toEqual({ version: "0.22.0", notes: "- Kibana." });
  });

  it("is the newest section for a build the changelog does not name yet", () => {
    expect(changelogSection(changelog, "0.24.0")?.version).toBe("0.23.0");
    expect(changelogSection("no versions here", "1.0.0")).toBeNull();
  });
});
