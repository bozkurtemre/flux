// What ties one request's log lines together. A request crosses services, and each service
// writes to its own stream, so the only thing that makes them one story is a field both
// carry: a trace id, a request id, an order. This picks that field out of a row.

/** The names any service might use, best first. A row usually carries more than one. */
const BUILT_IN: [RegExp, string][] = [
  [/^(x[_-])?trace[_-]?id$/i, "trace id"],
  [/^(x[_-])?request[_-]?id$/i, "request id"],
  [/^correlation[_-]?id$/i, "correlation id"],
  [/^transaction[_-]?id$/i, "transaction id"],
  [/^(x[_-])?session[_-]?id$/i, "session id"],
  [/^order[_-]?id$/i, "order id"],
  [/^user[_-]?id$/i, "user id"],
];

/**
 * The names worth following, best first, and what each is called for a reader, in the same
 * order: the built-in ones, with a project's own (Settings › Advanced › Correlation fields)
 * ahead of the user id, which is the vaguest. Kept as live arrays, so every importer sees
 * a change to the setting at once.
 */
export const NAMES: RegExp[] = BUILT_IN.map(([n]) => n);
export const NAME_LABELS: string[] = BUILT_IN.map(([, l]) => l);

/** A project's own id fields, as Settings › Advanced has them. */
let custom: string[] = [];

/** The setting's text as field names: comma- or space-separated, only what a field name can be. */
export function parseFields(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((f) => /^[A-Za-z0-9_.@-]+$/.test(f)))];
}

export function setCorrelationFields(text: string) {
  custom = parseFields(text).filter((f) => !BUILT_IN.some(([n]) => n.test(f)));
  const own = custom.map((f): [RegExp, string] => [new RegExp(`^${f.replace(/\./g, "\\.")}$`, "i"), f]);
  const all = [...BUILT_IN.slice(0, -1), ...own, BUILT_IN[BUILT_IN.length - 1]];
  NAMES.splice(0, NAMES.length, ...all.map(([n]) => n));
  NAME_LABELS.splice(0, NAME_LABELS.length, ...all.map(([, l]) => l));
}

/** The project's own id fields, for a query that asks for rows carrying any id. */
export function customFields(): string[] {
  return custom;
}

/** Graylog writes a dash where a field was empty, which is not something to follow. */
export function identifying(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (text.length < 4 || text.length > 200) return false;
  return !["-", "n/a", "null", "none", "undefined", "0"].includes(text.toLowerCase());
}

/**
 * A field's own name, without what holds it: Laravel keeps the request id as `context.request_id`
 * and a gateway as `request_id`, and both are the request id.
 */
export function leaf(field: string): string {
  return field.slice(field.lastIndexOf(".") + 1);
}

export interface Correlation {
  field: string;
  value: string;
}

/**
 * The field to follow this row by. `preferred` is the column that was right-clicked: when it
 * holds something identifying it wins, because it is the one being pointed at.
 */
export function correlationOf(row: Record<string, unknown>, preferred?: string): Correlation | null {
  if (preferred && identifying(row[preferred])) return { field: preferred, value: String(row[preferred]) };
  for (const name of NAMES) {
    const found = Object.keys(row).find((k) => name.test(leaf(k)) && identifying(row[k]));
    if (found) return { field: found, value: String(row[found]) };
  }
  return null;
}

/**
 * Where a line of the inspector's JSON writes its value, as the characters [from, to) of the
 * line, and the key it is under: what the inspector marks under the pointer, and what
 * `pairOnLine` reads, so the two never disagree.
 */
export function valueOnLine(line: string): { key?: string; from: number; to: number } | null {
  const pair = /^(\s*"((?:[^"\\]|\\.)*)"\s*:\s*)(.*?),?\s*$/.exec(line);
  if (pair) {
    // `"context": {` names a block rather than a value; there is nothing to follow in `{`
    if (pair[3] === "{" || pair[3] === "[") return null;
    return { key: pair[2], from: pair[1].length, to: pair[1].length + pair[3].length };
  }
  const bare = line.trim().replace(/,$/, "");
  if (!bare || "{}[]".includes(bare)) return null;
  const from = line.length - line.trimStart().length;
  return { from, to: from + bare.length };
}

/** What a line of the inspector's JSON says: the key it names, and the value it holds. */
export function pairOnLine(line: string): { key?: string; value: string } | null {
  const at = valueOnLine(line);
  return at ? { key: at.key, value: unquote(line.slice(at.from, at.to)) } : null;
}

/** JSON's own escaping, undone: what is copied or searched is what was logged. */
function unquote(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('"')) return trimmed;
  try {
    return JSON.parse(trimmed) as string;
  } catch {
    return trimmed.replace(/^"|"$/g, "");
  }
}
