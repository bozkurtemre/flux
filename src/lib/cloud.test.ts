import { describe, expect, it } from "vitest";
import { callbackOf, isEmail, preferencesOf, withPreferences } from "./cloud";
import { DEFAULTS, type Settings } from "./settings";

const mine: Settings = {
  ...DEFAULTS,
  connections: [{ id: "c1", name: "prod", kind: "graylog", url: "https://graylog.example", token: "secret" }],
  projects: [{ id: "p1", connectionId: "c1", name: "Wallet", streams: ["s1"] }],
  replay: { bases: { c1: "https://stage.example" } },
  appearance: { ...DEFAULTS.appearance, theme: "light" },
};

describe("what syncs", () => {
  it("is the preferences, never the connections, their tokens, projects or stage addresses", () => {
    const synced = preferencesOf(mine);
    expect(Object.keys(synced)).not.toContain("connections");
    expect(Object.keys(synced)).not.toContain("projects");
    expect(Object.keys(synced)).not.toContain("replay");
    expect(JSON.stringify(synced)).not.toContain("secret");
    expect(synced.appearance.theme).toBe("light");
  });

  it("lands over this machine's preferences, leaving its own parts as they were", () => {
    const remote = { appearance: { ...DEFAULTS.appearance, theme: "dark" as const, uiFontSize: 15 } };
    const merged = withPreferences(mine, remote);
    expect(merged.appearance.uiFontSize).toBe(15);
    expect(merged.connections).toEqual(mine.connections);
    expect(merged.projects).toEqual(mine.projects);
    expect(merged.replay).toEqual(mine.replay);
  });
});

describe("the link back from the email", () => {
  it("carries a code to finish with", () => {
    expect(callbackOf("flux://auth/callback?code=abc-123")).toEqual({ code: "abc-123" });
  });

  it("or the reason it failed, from the query or the fragment", () => {
    expect(callbackOf("flux://auth/callback?error=access_denied&error_description=Email+link+is+invalid+or+has+expired")).toEqual({
      error: "Email link is invalid or has expired",
    });
    expect(callbackOf("flux://auth/callback#error=access_denied&error_description=expired")).toEqual({ error: "expired" });
  });

  it("is nothing to sign-in when it is another Flux link", () => {
    expect(callbackOf("flux://open?stream=x")).toBeNull();
  });
});

describe("an email address", () => {
  it("has a name, an @ and a domain with a dot", () => {
    expect(isEmail(" me@esim.io ")).toBe(true);
    expect(isEmail("me@localhost")).toBe(false);
    expect(isEmail("not an email")).toBe(false);
  });
});
