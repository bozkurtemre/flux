import { describe, expect, it } from "vitest";
import { callbackOf, gravatarUrl, inboxOf, isEmail, pictureCandidates, preferencesOf, withPreferences } from "./cloud";
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

describe("inboxOf", () => {
  it("knows the webmail of a known domain, and not of a work one", () => {
    expect(inboxOf("a@gmail.com")?.name).toBe("Gmail");
    expect(inboxOf("a@hotmail.co.uk")?.name).toBe("Outlook");
    expect(inboxOf("a@company.com")).toBeNull();
  });
});

describe("the account's picture", () => {
  it("takes the provider's picture first, once, and only over https", () => {
    const user = {
      email: "a@b.co",
      user_metadata: { avatar_url: "https://avatars.githubusercontent.com/u/1", picture: "https://avatars.githubusercontent.com/u/1" },
      identities: [
        { identity_data: { picture: "https://lh3.googleusercontent.com/p" } },
        { identity_data: { avatar_url: "http://plain.example/x" } },
      ],
    };
    expect(pictureCandidates(user)).toEqual(["https://avatars.githubusercontent.com/u/1", "https://lh3.googleusercontent.com/p"]);
    expect(pictureCandidates({ email: "a@b.co" })).toEqual([]);
  });

  it("asks Gravatar by the hash of the address, trimmed and lowered, missing as a 404, afresh at each sign-in", async () => {
    const url = await gravatarUrl("  Emre@Example.com ", "2026-10-14T10:00:00Z");
    expect(url).toMatch(/^https:\/\/gravatar\.com\/avatar\/[0-9a-f]{64}\?s=128&d=404&v=2026-10-14T10%3A00%3A00Z$/);
    expect(url).toBe(await gravatarUrl("emre@example.com", "2026-10-14T10:00:00Z"));
    expect(url).not.toBe(await gravatarUrl("emre@example.com", "2026-10-15T10:00:00Z"));
  });
});
