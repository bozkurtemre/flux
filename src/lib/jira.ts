// A log line, or a pattern, as the start of a Jira issue. Writing the ticket is mostly copying:
// what failed, how often, where in the code, and a way back to the logs — all of which Flux is
// already looking at. The issue is opened through Jira's own create link with those filled in,
// so Flux needs no Jira token: the browser that opens it is already signed in.

export interface JiraSettings {
  /** The site, e.g. https://acme.atlassian.net. Empty means the feature is not set up. */
  site: string;
  /** The project's numeric id, which is what Jira's create link takes rather than its key. */
  projectId: string;
  /** The issue type's numeric id; empty leaves Jira to its default. */
  issueTypeId: string;
}

export interface Draft {
  summary: string;
  description: string;
}

/** Long enough for the story, short enough that the link still opens. */
const LIMIT = 6000;

/**
 * The issue for a row: its message as the summary, and the description Jira's wiki markup
 * reads — the stream and the time, the frames of ours the trace names, the row itself, and the
 * link back to the view.
 */
export function draftForRow(o: {
  row: Record<string, unknown>;
  stream: string;
  frames: { path: string; line: number }[];
  link?: string;
  count?: number;
}): Draft {
  const message = String(o.row.message ?? o.row.full_message ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const summary = shorten(message || `Log entry on ${o.stream}`, 200);
  const lines = [
    `*Stream:* ${o.stream}`,
    o.row.timestamp ? `*Seen at:* ${String(o.row.timestamp)}` : "",
    o.count ? `*Matches:* ${o.count.toLocaleString()} in the range searched` : "",
    o.link ? `*In Flux:* ${o.link}` : "",
    "",
    o.frames.length ? "h3. Where" : "",
    ...o.frames.slice(0, 5).map((f) => `* {{${f.path}:${f.line}}}`),
    o.frames.length ? "" : "",
    "h3. The entry",
    `{code:json}\n${JSON.stringify(o.row, null, 2)}\n{code}`,
  ];
  return { summary, description: fit(lines.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n")) };
}

/** The issue for a message pattern: the template as the summary, a sample under it. */
export function draftForPattern(o: { template: string; count: number; sample: string; stream: string; link?: string }): Draft {
  return {
    summary: shorten(o.template, 200),
    description: fit(
      [
        `*Stream:* ${o.stream}`,
        `*Occurrences:* ${o.count.toLocaleString()} in the rows read`,
        o.link ? `*In Flux:* ${o.link}` : "",
        "",
        "h3. Pattern",
        `{noformat}${o.template}{noformat}`,
        "h3. A sample",
        `{noformat}${o.sample}{noformat}`,
      ]
        .filter((l, i, all) => l !== "" || all[i - 1] !== "")
        .join("\n"),
    ),
  };
}

/**
 * Jira's create link with the draft in it, or null when Jira is not set up. Without a project
 * id the link opens the empty create screen, and the draft is left for the clipboard.
 */
export function issueUrl(jira: JiraSettings, draft: Draft): { url: string; filled: boolean } | null {
  const site = jira.site.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(site)) return null;
  if (!jira.projectId.trim()) return { url: `${site}/secure/CreateIssue!default.jspa`, filled: false };
  const q = new URLSearchParams({ pid: jira.projectId.trim(), summary: draft.summary, description: draft.description });
  if (jira.issueTypeId.trim()) q.set("issuetype", jira.issueTypeId.trim());
  return { url: `${site}/secure/CreateIssueDetails!init.jspa?${q.toString()}`, filled: true };
}

function shorten(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function fit(s: string): string {
  return s.length > LIMIT ? `${s.slice(0, LIMIT - 40)}\n…\n_(cut short to fit the link)_` : s;
}
