// What ties one request's log lines together. A request crosses services, and each service
// writes to its own stream, so the only thing that makes them one story is a field both
// carry: a trace id, a request id, an order. This picks that field out of a row.

/** The names worth following, best first. A row usually carries more than one. */
const NAMES = [
  /^(x[_-])?trace[_-]?id$/i,
  /^(x[_-])?request[_-]?id$/i,
  /^correlation[_-]?id$/i,
  /^transaction[_-]?id$/i,
  /^(x[_-])?session[_-]?id$/i,
  /^order[_-]?id$/i,
  /^iccid$/i,
  /^user[_-]?id$/i,
];

/** Graylog writes a dash where a field was empty, which is not something to follow. */
export function identifying(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (text.length < 4 || text.length > 200) return false;
  return !["-", "n/a", "null", "none", "undefined", "0"].includes(text.toLowerCase());
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
    const found = Object.keys(row).find((k) => name.test(k) && identifying(row[k]));
    if (found) return { field: found, value: String(row[found]) };
  }
  return null;
}
