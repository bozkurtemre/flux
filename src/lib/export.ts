// What leaves Flux: the results as a file, and a value as something to paste into whatever
// the conversation is happening in.
//
// The results, as a file. CSV for a spreadsheet, JSON for everything else; both are built
// from the columns on screen, in the order they are on screen, because that is the table the
// person is looking at.
import type { MessagePage } from "./datasource";

/** RFC 4180: quote when it would otherwise be read wrong, and double the quotes inside. */
export function csvCell(value: unknown): string {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(page: MessagePage, columns: string[]): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of page.rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  return lines.join("\r\n");
}

export function toJson(page: MessagePage, columns: string[]): string {
  return JSON.stringify(
    page.rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))),
    null,
    2,
  );
}

/** A name that says what it holds and when it was taken. */
export function exportName(title: string, format: "csv" | "json", at = new Date()): string {
  const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const slug = title.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "results";
  return `${slug}-${stamp}.${format}`;
}

/** Where a pasted value is going, and therefore how it has to be wrapped. */
export type Flavour = "slack" | "markdown" | "jira";

/**
 * A value as a code block. Slack takes bare fences and ignores a language after them, so it
 * does not get one; Markdown is told it is JSON; Jira has fences of its own.
 */
export function codeBlock(text: string, flavour: Flavour): string {
  const body = text.replace(/\s+$/, "");
  if (flavour === "jira") return `{code:json}\n${body}\n{code}`;
  return `\`\`\`${flavour === "markdown" ? "json" : ""}\n${body}\n\`\`\``;
}
