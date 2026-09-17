import { describe, expect, it } from "vitest";
import { stale } from "./r2.mjs";

const keys = [
  "updates/latest.json",
  "updates/0.4.0/Flux.app.tar.gz",
  "updates/0.4.0/Flux_0.4.0_universal.dmg",
  "updates/0.5.0/Flux.app.tar.gz",
  "updates/0.5.0/Flux_0.5.0_universal.dmg",
  "updates/0.10.0/Flux.app.tar.gz",
];

describe("keeping the newest versions", () => {
  it("removes everything older than the newest two", () => {
    expect(stale(keys, 2)).toEqual(["updates/0.4.0/Flux.app.tar.gz", "updates/0.4.0/Flux_0.4.0_universal.dmg"]);
  });

  it("orders versions as numbers, not as strings", () => {
    // 0.10.0 is newer than 0.5.0, which a lexical sort gets backwards
    expect(stale(keys, 1)).not.toContain("updates/0.10.0/Flux.app.tar.gz");
    expect(stale(keys, 1)).toContain("updates/0.5.0/Flux.app.tar.gz");
  });

  it("never touches the manifest or anything that is not a version", () => {
    expect(stale(keys, 1)).not.toContain("updates/latest.json");
    expect(stale([...keys, "updates/notes/readme.txt"], 1)).not.toContain("updates/notes/readme.txt");
  });

  it("deletes nothing when there is nothing older", () => {
    expect(stale(["updates/latest.json", "updates/0.5.0/Flux.app.tar.gz"], 2)).toEqual([]);
  });
});
