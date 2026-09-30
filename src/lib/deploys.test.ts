import { describe, expect, it } from "vitest";
import { along, mergesCommand, readMerges } from "./deploys";

describe("asking GitHub what was merged", () => {
  it("names the repository and the window, and nothing a shell could misread", () => {
    const cmd = mergesCommand("acme/wallet", new Date("2026-09-18T11:00:00.000Z"), new Date("2026-09-18T12:00:00.000Z"));
    expect(cmd).toBe(
      "gh pr list --repo acme/wallet --state merged --search merged:2026-09-18T11:00:00Z..2026-09-18T12:00:00Z --json number,title,mergedAt,url --limit 50",
    );
  });

  it("quotes a repository name that would otherwise be a shell's", () => {
    expect(mergesCommand("acme/$(rm -rf)", new Date(0), new Date(1))).toContain("'acme/$(rm -rf)'");
  });
});

describe("reading what came back", () => {
  it("turns merged pull requests into markers, oldest first", () => {
    const json = JSON.stringify([
      { number: 12, title: "Retry activation", mergedAt: "2026-09-18T11:40:00Z", url: "https://github.com/acme/wallet/pull/12" },
      { number: 9, title: "Bump provider SDK", mergedAt: "2026-09-18T11:05:00Z", url: "https://github.com/acme/wallet/pull/9" },
    ]);
    expect(readMerges(json).map((m) => m.label)).toEqual(["#9 Bump provider SDK", "#12 Retry activation"]);
  });

  it("leaves out what it cannot place", () => {
    expect(readMerges(JSON.stringify([{ number: 1, title: "no date", url: "u" }]))).toEqual([]);
    expect(readMerges("gh: not logged in")).toEqual([]);
  });
});

describe("where a marker sits", () => {
  it("is how far along the timeline it happened", () => {
    expect(along("2026-09-18T11:30:00Z", "2026-09-18T11:00:00Z", "2026-09-18T12:00:00Z")).toBe(50);
  });

  it("is nowhere when it happened outside it", () => {
    expect(along("2026-09-18T10:00:00Z", "2026-09-18T11:00:00Z", "2026-09-18T12:00:00Z")).toBeNull();
  });
});
