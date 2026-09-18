// What the console line means. A query is Lucene, as Graylog reads it, followed by any
// number of `| group by <field>` clauses. Each clause asks a separate question and gets a
// table of its own, which is why they are a list rather than one field.
//
// The split is on the whole clause, not on the pipe, so a pipe inside the query — a regex
// alternation, a value that contains one — is left where it was. At the start of the line
// there is nothing to separate the clause from, so the pipe is optional there.
const CLAUSE = /(?:^|\|)\s*group\s*by\s+/i;

/** `between <from> and <to>`, the window the console searches instead of the last minutes. */
const BETWEEN = /(?:^|\|)\s*between\s+(\S+)\s+and\s+(\S+)\s*/i;

export interface ParsedQuery {
  /** What Graylog is asked for the messages. */
  search: string;
  /** One field per grouped table, in the order they were written. */
  groupBy: string[];
  /** The window named by a `between` clause, if the line names one. */
  between?: { from: string; to: string };
}

export function parseQuery(text: string): ParsedQuery {
  let line = text;
  let between: { from: string; to: string } | undefined;
  const window = BETWEEN.exec(line);
  if (window) {
    // a window nobody can read is not a window; the line keeps whatever was typed and the
    // search falls back to the last minutes
    const ok = [window[1], window[2]].every((t) => !Number.isNaN(new Date(t).getTime()));
    if (ok) {
      between = { from: window[1], to: window[2] };
      line = line.slice(0, window.index) + line.slice(window.index + window[0].length);
    }
  }

  const parts = line.split(CLAUSE);
  const groupBy: string[] = [];
  for (const part of parts.slice(1)) {
    // `group by method, route` is two tables rather than one aggregation over both: the
    // pair times out on a busy stream, see src/lib/endpoints.ts
    for (const field of part.split(",")) {
      const name = field.trim();
      if (name && !groupBy.includes(name)) groupBy.push(name);
    }
  }
  return {
    search: parts[0]
      .trim()
      .replace(/\|\s*$/, "")
      .trim(),
    groupBy,
    between,
  };
}

/** A Lucene clause for one field of one row. Quoted, because a log value is not a term. */
export function fieldClause(field: string, value: unknown, negate = false): string {
  const quoted = `"${String(value ?? "").replace(/(["\\])/g, "\\$1")}"`;
  return `${negate ? "NOT " : ""}${field}:${quoted}`;
}

/** The line with one more clause on its query, leaving any `group by` where it belongs. */
export function withClause(line: string, clause: string): string {
  const { search, groupBy } = parseQuery(line);
  const query = search ? `${search} AND ${clause}` : clause;
  return [query, ...groupBy.map((f) => `group by ${f}`)].join(" | ");
}

/** The line with one more table on it, asked for at most once. */
export function withGroupBy(line: string, field: string): string {
  const { search, groupBy } = parseQuery(line);
  const fields = groupBy.includes(field) ? groupBy : [...groupBy, field];
  return [search, ...fields.map((f) => `group by ${f}`)].filter(Boolean).join(" | ");
}

/** The line searching one window, replacing whatever window it named before. */
export function withBetween(line: string, from: Date, to: Date): string {
  const at = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const rest = line
    .replace(BETWEEN, "")
    .replace(/^\s*\|/, "")
    .trim();
  return [rest, `between ${at(from)} and ${at(to)}`].filter(Boolean).join(" | ");
}
