// One error, investigated: what the request it belonged to did across every service, how often
// it happens and since when, who else it hits and what they share, the line of code that wrote it
// with the change that last touched that line, and what was merged lately. Each part is something
// Flux already knew how to find; together they are the case, written as a report a person reads
// and Claude Code is handed to fix.
import type { Blame } from "./located";
import type { Marker } from "./deploys";

export interface Evidence {
  subject: { stream: string; at: string; level?: string; message: string };
  trace?: {
    field: string;
    value: string;
    lanes: { stream: string; lines: number; errors: number }[];
    /** The failures along the way, in time order, the first being where it broke. */
    failures: { at: string; stream: string; message: string }[];
  };
  frequency?: { pattern: string; lastHour: number; lastDay: number; firstSeen?: string };
  spread?: { sampled: number; ids: number; idKind?: string; shared: { field: string; value: string; share: number }[] };
  code?: { file: string; line: number; text?: string; from: "stack" | "search"; blame?: Blame; pr?: { number: number; title: string; url: string } };
  merges?: Marker[];
}

const first = (text: string, max = 300) => {
  const line = text.split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** A branch name a fix can take: `fix/provider-order-failed`. */
export function slugOf(message: string): string {
  const words = first(message, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 2 && !/^\d+$/.test(w))
    .slice(0, 5);
  return `fix/${words.join("-") || "production-error"}`;
}

/** The case as Markdown: what a person reads first, and the evidence under it. */
export function reportOf(e: Evidence): string {
  const out: string[] = [];
  out.push(`# ${first(e.subject.message, 120)}`, "");
  out.push(`- **Where:** ${e.subject.stream}${e.subject.level ? ` (${e.subject.level})` : ""}`, `- **When:** ${e.subject.at}`);
  if (e.frequency) {
    out.push(
      `- **How often:** ${e.frequency.lastHour.toLocaleString("en")} in the last hour, ${e.frequency.lastDay.toLocaleString("en")} in the last 24 hours${
        e.frequency.firstSeen ? `, first seen ${e.frequency.firstSeen}` : ""
      }`,
    );
  }
  if (e.spread) {
    const shared = e.spread.shared.map((s) => `\`${s.field}=${s.value}\` (${Math.round(s.share * 100)}%)`).join(", ");
    out.push(
      `- **Who else:** ${e.spread.ids.toLocaleString("en")} distinct ${e.spread.idKind ?? "ids"} in a sample of ${e.spread.sampled.toLocaleString("en")}${
        shared ? `; most of them share ${shared}` : ""
      }`,
    );
  }
  if (e.code)
    out.push(`- **Written at:** \`${e.code.file}:${e.code.line}\`${e.code.from === "stack" ? " (from the stack trace)" : " (found by its text)"}`);
  out.push("", "## The message", "", "```", e.subject.message.slice(0, 2000), "```");

  if (e.trace) {
    out.push("", `## The request across services (${e.trace.field} = ${e.trace.value})`, "");
    for (const l of e.trace.lanes) out.push(`- ${l.stream}: ${l.lines} lines${l.errors ? `, ${l.errors} failed` : ""}`);
    if (e.trace.failures.length) {
      out.push("", "Failures, in order:", "");
      for (const f of e.trace.failures.slice(0, 8)) out.push(`- ${f.at} **${f.stream}** — ${first(f.message, 200)}`);
    }
  }

  if (e.code) {
    out.push("", "## The code", "", `\`${e.code.file}:${e.code.line}\``);
    if (e.code.text) out.push("", "```", e.code.text, "```");
    if (e.code.blame) {
      const pr = e.code.pr ? `, in [#${e.code.pr.number} ${e.code.pr.title}](${e.code.pr.url})` : "";
      out.push(
        "",
        `Last changed in ${e.code.blame.sha.slice(0, 10)} by ${e.code.blame.author} on ${e.code.blame.date}: ${e.code.blame.subject}${pr}`,
      );
    }
  }

  if (e.merges?.length) {
    out.push("", "## Merged in the last 48 hours", "");
    for (const m of e.merges.slice(0, 10)) out.push(`- ${m.at} [${m.label}](${m.url})`);
  }
  return out.join("\n");
}

/**
 * What Claude Code is asked: to find the cause before changing anything, to fix it on a branch of
 * its own with a test, and to stop at a draft pull request — a person merges it.
 */
export function promptOf(report: string, message: string): string {
  return [
    "Investigate and fix this production error. The evidence Flux gathered is below.",
    "",
    "1. Find the root cause in the code, using the evidence. Say what it is, and why, before changing anything.",
    `2. Make the smallest fix on a new branch named ${slugOf(message)}, with a test that fails without it.`,
    "3. Run the project's tests.",
    "4. Open a draft pull request with gh that explains the cause and links this evidence. Do not merge it or push to the main branch.",
    "",
    "The Flux MCP tools (search_logs, count_logs) can look further into the logs if the evidence is not enough.",
    "",
    "---",
    "",
    report,
  ].join("\n");
}
