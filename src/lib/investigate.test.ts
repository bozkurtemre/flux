import { describe, expect, it } from "vitest";
import { promptOf, reportOf, slugOf, type Evidence } from "./investigate";

const evidence: Evidence = {
  subject: {
    stream: "orders",
    at: "2026-10-12T10:00:09Z",
    level: "ERROR",
    message: "Provider order failed for iccid 8990: timeout after 8000ms\n#0 app/Services/Provider/JtsClient.php(88)",
  },
  trace: {
    field: "request_id",
    value: "r1",
    lanes: [
      { stream: "gateway", lines: 1, errors: 1 },
      { stream: "provider", lines: 1, errors: 1 },
    ],
    failures: [{ at: "2026-10-12T10:00:00Z", stream: "provider", message: "provider timeout" }],
  },
  frequency: { pattern: "Provider order failed for iccid <num>", lastHour: 94, lastDay: 120, firstSeen: "2026-10-12T09:10:00Z" },
  spread: { sampled: 120, ids: 94, idKind: "order ids", shared: [{ field: "provider", value: "JTS", share: 0.91 }] },
  code: {
    file: "app/Services/Provider/JtsClient.php",
    line: 88,
    text: "$response = $this->http->request('POST', $url, ['timeout' => 8]);",
    from: "stack",
    blame: { sha: "abc1234def5678", author: "Ayşe", date: "2026-10-11", subject: "perf: lower the provider timeout" },
    pr: { number: 412, title: "Lower provider timeout", url: "https://github.com/acme/esim/pull/412" },
  },
  merges: [{ at: "2026-10-11T16:00:00Z", label: "#412 Lower provider timeout", url: "https://github.com/acme/esim/pull/412" }],
};

describe("the report of an investigation", () => {
  const report = reportOf(evidence);

  it("leads with what a person needs first", () => {
    expect(report.split("\n").slice(0, 8)).toEqual([
      "# Provider order failed for iccid 8990: timeout after 8000ms",
      "",
      "- **Where:** orders (ERROR)",
      "- **When:** 2026-10-12T10:00:09Z",
      "- **How often:** 94 in the last hour, 120 in the last 24 hours, first seen 2026-10-12T09:10:00Z",
      "- **Who else:** 94 distinct order ids in a sample of 120; most of them share `provider=JTS` (91%)",
      "- **Written at:** `app/Services/Provider/JtsClient.php:88` (from the stack trace)",
      "",
    ]);
  });

  it("carries the request's path, the code, the change behind it and what was merged", () => {
    expect(report).toContain("## The request across services (request_id = r1)");
    expect(report).toContain("- 2026-10-12T10:00:00Z **provider** — provider timeout");
    expect(report).toContain(
      "Last changed in abc1234def by Ayşe on 2026-10-11: perf: lower the provider timeout, in [#412 Lower provider timeout](https://github.com/acme/esim/pull/412)",
    );
  });

  it("leaves out what was not found", () => {
    const bare = reportOf({ subject: { stream: "x", at: "now", message: "boom" } });
    expect(bare).toBe("# boom\n\n- **Where:** x\n- **When:** now\n\n## The message\n\n```\nboom\n```");
  });
});

describe("what Claude Code is asked", () => {
  it("is to find the cause first, fix it on a branch with a test, and stop at a draft pull request", () => {
    const prompt = promptOf("REPORT", evidence.subject.message);
    expect(prompt).toContain("new branch named fix/provider-order-failed-for-iccid");
    expect(prompt).toContain("Do not merge it or push to the main branch.");
    expect(prompt.endsWith("REPORT")).toBe(true);
  });

  it("names the branch after the message, numbers left out", () => {
    expect(slugOf("Timeout after 8000ms on POST /v1/orders")).toBe("fix/timeout-after-8000ms-post-orders");
    expect(slugOf("!!!")).toBe("fix/production-error");
  });
});
