import { describe, expect, it } from "vitest";
import { curlOf, sh } from "./curl";

describe("a logged request, sent again", () => {
  it("is read off the row's own fields", () => {
    expect(curlOf({ method: "post", route: "/v1/wallet", host: "api.example" })).toBe("curl -X POST 'https://api.example/v1/wallet'");
  });

  it("is read out of the JSON a message turns out to be", () => {
    const message = JSON.stringify({
      context: { params: { method: "PUT", path: "/v1/esim/42", headers: { Accept: ["application/json"] }, body: { plan: "eu-5gb" } } },
    });
    expect(curlOf({ message })).toBe(`curl -X PUT "$BASE/v1/esim/42" -H 'Accept: application/json' --data-raw '{"plan":"eu-5gb"}'`);
  });

  it("leaves a path relative to $BASE when the log never said where it went", () => {
    expect(curlOf({ method: "GET", uri: "/health" })).toBe('curl -X GET "$BASE/health"');
  });

  it("keeps a full URL as it was logged", () => {
    expect(curlOf({ method: "GET", url: "https://api.example/v1/ping?x=1" })).toBe("curl -X GET 'https://api.example/v1/ping?x=1'");
  });

  it("keeps what authenticates it out of the command unless asked", () => {
    const row = { method: "GET", url: "https://api.example/me", headers: { Authorization: "Bearer live-token", Cookie: "s=1" } };
    const safe = curlOf(row) ?? "";
    expect(safe).not.toContain("live-token");
    expect(safe).toContain("'Authorization: <redacted>'");
    expect(safe).toContain("'Cookie: <redacted>'");
    expect(curlOf(row, { secrets: true })).toContain("Bearer live-token");
  });

  it("survives a quote in a body", () => {
    expect(curlOf({ method: "POST", url: "https://a.example", body: "it's" })).toContain(`--data-raw 'it'\\''s'`);
  });

  it("is nothing for a row that is not a request", () => {
    expect(curlOf({ message: "cache warmed", level: 6 })).toBeNull();
    expect(curlOf({ method: "-", route: "-" })).toBeNull();
  });
});

describe("quoting for the shell", () => {
  it("takes $, backticks and backslashes literally", () => {
    expect(sh("$HOME `id` \\n")).toBe("'$HOME `id` \\n'");
  });
});
