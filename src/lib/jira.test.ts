import { describe, expect, it } from "vitest";
import { draftForPattern, draftForRow, issueUrl } from "./jira";

const jira = { site: "https://acme.atlassian.net/", projectId: "10042", issueTypeId: "10004" };

describe("a row, as the start of an issue", () => {
  const row = { timestamp: "2026-09-18T11:00:00Z", message: "Activation   failed for iccid 8931\n retrying", level: 3 };

  it("takes its message, on one line, as the summary", () => {
    expect(draftForRow({ row, stream: "payments", frames: [] }).summary).toBe("Activation failed for iccid 8931 retrying");
  });

  it("says where, when, how often and how to get back to it", () => {
    const d = draftForRow({ row, stream: "payments", frames: [{ path: "app/Jobs/Activate.php", line: 42 }], link: "flux://open?x=1", count: 17 });
    expect(d.description).toContain("*Stream:* payments");
    expect(d.description).toContain("*Matches:* 17");
    expect(d.description).toContain("{{app/Jobs/Activate.php:42}}");
    expect(d.description).toContain("flux://open?x=1");
    expect(d.description).toContain("{code:json}");
  });

  it("is held to a length the link can carry", () => {
    const huge = { message: "x", blob: "y".repeat(20_000) };
    expect(draftForRow({ row: huge, stream: "s", frames: [] }).description.length).toBeLessThan(6100);
  });

  it("has a summary even when the row has no message", () => {
    expect(draftForRow({ row: { level: 3 }, stream: "payments", frames: [] }).summary).toBe("Log entry on payments");
  });
});

describe("a pattern, as the start of an issue", () => {
  it("names the template and shows a real line under it", () => {
    const d = draftForPattern({ template: "timeout for order <num>", count: 412, sample: "timeout for order 77", stream: "orders" });
    expect(d.summary).toBe("timeout for order <num>");
    expect(d.description).toContain("*Occurrences:* 412");
    expect(d.description).toContain("timeout for order 77");
  });
});

describe("Jira's create link", () => {
  const draft = { summary: "Boom & bust", description: "*a* b" };

  it("carries the draft to the project and type it is set up for", () => {
    const made = issueUrl(jira, draft);
    expect(made?.filled).toBe(true);
    const url = new URL(made!.url);
    expect(url.origin + url.pathname).toBe("https://acme.atlassian.net/secure/CreateIssueDetails!init.jspa");
    expect(url.searchParams.get("pid")).toBe("10042");
    expect(url.searchParams.get("issuetype")).toBe("10004");
    expect(url.searchParams.get("summary")).toBe("Boom & bust");
  });

  it("opens the empty create screen when no project is set, and says the draft is not in it", () => {
    expect(issueUrl({ ...jira, projectId: "" }, draft)).toEqual({ url: "https://acme.atlassian.net/secure/CreateIssue!default.jspa", filled: false });
  });

  it("is nothing until a site is set", () => {
    expect(issueUrl({ site: "", projectId: "1", issueTypeId: "" }, draft)).toBeNull();
    expect(issueUrl({ site: "acme.atlassian.net", projectId: "1", issueTypeId: "" }, draft)).toBeNull();
  });
});
