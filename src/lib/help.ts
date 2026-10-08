// What the Help menu opens. Written for someone who has just installed Flux and for someone who
// has used it for a month and wants the one thing they forgot, so each heading is something you
// would look for, and each line is something you can do.

export const GETTING_STARTED = `# Getting started

## Connect

- **Settings › Connections** takes a Graylog URL and an access token, or a Kibana URL and an API key for logs in Elasticsearch. The token stays in \`connections.json\` on this machine.
- **Settings › Projects › Add from export** takes a set-up file a teammate sent: their projects and saved queries, without their tokens.

## Find what you need

- **⇧⇧** searches everything: streams, endpoints, projects, the queries you ran, and the app's own actions.
- **⇧⌘A** finds an action by name.
- The tree on the left lists connections, projects, streams and the endpoints Flux derives from them. **Enter** on a stream or an endpoint opens a console.

## Read the logs

- A console takes a Lucene query; **⌘⏎** runs it and **⌘R** runs it again.
- The **timeline** above the results is messages per bucket: drag across it to narrow the range. Dashed lines mark pull requests merged into the project's repository.
- **⌥-drag** across a spike to ask why it is different: Flux compares the values of a dozen fields in the stretch with the time before it and lists the ones that grew, like "90% of it is \`app_version:3.4.1\`, against 10% before". A row narrows the console to that value.
- A search that finds nothing says why: each term is counted with the others, so the one whose absence brings rows back is shown first, and a field the stream does not have is named with the one it most likely meant. **Remove** runs the search without it.
- **Follow** keeps new messages arriving at the top; **Export** writes what is on screen as CSV or JSON.
- The **Fields** panel under the tree lists every field on screen and its commonest values; a value filters by it.

## Work with a row

- Clicking a row opens the **value inspector**: the row as JSON, foldable, searchable with **⌘F**. The files a stack trace names open in your IDE.
- Right-click a row to **filter** by a field, **exclude** it, **follow the request** across every stream, see **five minutes around** it, **copy it as cURL**, start a **Jira issue**, or **paste it to Claude**.
- Tick **Compare** on two rows to see them side by side, field by field.
- **Where is this logged?** — on a row or a pattern — finds the message's literal words in the project's checkout with \`git grep\`, lists the lines that write a log first, and blames the one you pick, with the pull request it came in with. Each line opens in your IDE.
- **Replay on stage…** sends the request a row describes again — to the stage you name, remembered per connection — and sets the answer beside the one in the log. Tokens are never copied from the log: those headers start empty.

## Trace an ID

- **⇧⌘I** (or Search Everywhere › Trace) takes an ICCID, an order, a user or a request id and searches every stream for it, oldest first. Lanes over the results show which service said what and where it failed; a dot selects its row, and "found in" narrows the search to the field the id lives in.

## Keep what works

- **⌘S** saves a query by name, with the workspace. **Watch** one to be told when new matches arrive, while Flux is open — or, with **Alert when › Nothing arrives**, when it goes quiet: a cron that stopped, a webhook that no longer comes. A silence is reported once when it starts and once when it ends.
- The **History** tab keeps every query you ran.
- **Copy a link** to a view and anyone with the same Graylog opens it in their own Flux.

## Bring the agent in

- **⌥F12** opens the terminal. With the MCP server on (**Settings › MCP Server**), Claude in that terminal can search the logs and see what you are looking at.
`;

export const QUERY_LANGUAGE = `# Query language

A console line is a Lucene query, as Graylog and Elasticsearch both read it, followed by any of the clauses below, each after a \`|\`. At the start of a line the \`|\` can be left out.

## Searching

- \`level:ERROR\` — a field and a value.
- \`route:"/v1/wallet"\` — a value with spaces or slashes, quoted.
- \`level:ERROR AND NOT source:api-1\` — \`AND\`, \`OR\` and \`NOT\`, in capitals.
- \`responseTime:>2\` — ranges, also \`[1 TO 5]\`.
- \`_exists_:requestId\` — messages that carry a field at all.
- \`message:timeout*\` — a wildcard at the end of a term.

## Counting by a field

- \`| group by httpStatusCode\` — one table: each value, and how many messages carried it.
- \`| group by route | group by source\` — one table each, above the messages.
- \`| group by method, route\` — two tables, not one over both: the pair times out on a busy stream.

## Patterns

- \`| patterns\` — the messages on screen counted by their template, ids and numbers masked, commonest first.
- \`| patterns full_message\` — the same, over another field.

## A fixed window

- \`| between 2026-09-18T11:00:00Z and 2026-09-18T12:00:00Z\` — searches that window instead of the last minutes. A drag on the timeline, the date picker and "five minutes around this" all write it for you.

## Together

- \`level:ERROR | group by route | patterns | between 2026-09-18T11:00:00Z and 2026-09-18T12:00:00Z\`
`;

/** A GitHub issue, opened with what a report needs already in it. */
export function reportUrl(diagnostics: string): string {
  const body = `**What happened**\n\n\n**What you expected**\n\n\n**How to make it happen again**\n\n\n---\n\`\`\`\n${diagnostics}\n\`\`\``;
  return `https://github.com/bozkurtemre/flux/issues/new?${new URLSearchParams({ body }).toString()}`;
}
