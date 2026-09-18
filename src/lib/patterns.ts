// What the same log line looks like when the things that differ every time are taken out.
// Five hundred rows of "activation failed for iccid=8931..." are one problem, and counting
// them as one is the difference between reading a page and reading a number.
//
// It is done here, over the rows already on screen, rather than in Graylog: the masking is a
// guess about what is a value, and a guess is better made where it can be seen and changed.

/** Each rule replaces what varies with what it is. Order matters: the specific go first. */
const MASKS: [RegExp, string][] = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>"],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, "<time>"],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "<email>"],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>"],
  [/\b[0-9a-f]{24}\b/gi, "<oid>"],
  // a letter as well as a digit, or a long account number would be hex rather than a number
  [/\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi, "<hex>"],
  [/\b\d[\d,._]*\b/g, "<num>"],
];

/** The template a message is counted under. */
export function templateOf(message: unknown): string {
  let text = String(message ?? "").trim();
  for (const [re, mask] of MASKS) text = text.replace(re, mask);
  // one mask is as good as a run of them: `<num>.<num>.<num>` is still one version number
  text = text.replace(/(<\w+>)(?:[.:/-]\1)+/g, "$1").replace(/\s+/g, " ");
  return text.length > 300 ? `${text.slice(0, 299)}…` : text;
}

export interface Pattern {
  template: string;
  count: number;
  /** One message that landed here, so the masking can be checked against the real thing. */
  sample: string;
}

/**
 * The templates in these rows, the commonest first. `field` is what carries the message; a
 * row without it is not counted, rather than counted as empty.
 */
export function patternsOf(rows: Record<string, unknown>[], field = "message", limit = 50): Pattern[] {
  const found = new Map<string, Pattern>();
  for (const row of rows) {
    const value = row[field];
    if (value == null || value === "") continue;
    const template = templateOf(value);
    if (!template) continue;
    const seen = found.get(template);
    if (seen) seen.count += 1;
    else found.set(template, { template, count: 1, sample: String(value) });
  }
  return [...found.values()].sort((a, b) => b.count - a.count || a.template.localeCompare(b.template)).slice(0, limit);
}

/** Which field the messages are in: what the query asked for, or the first that looks like it. */
export function messageField(columns: string[]): string {
  return columns.find((c) => c === "message") ?? columns.find((c) => /message|msg|text|body/i.test(c)) ?? columns[columns.length - 1] ?? "message";
}
