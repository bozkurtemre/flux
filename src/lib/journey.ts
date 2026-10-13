// One id's story across every stream: a request, an order, a user. Each service writes to its own
// stream, so the story is told as lanes, one per stream, with a point for each line in time and
// the failures in red — and the fields the id was found in, which is how a support question
// ("this order failed") becomes the name of the field to search next time.

export interface Lane {
  stream: string;
  /** The index of each line in the page, when it was written, and whether it was a failure. */
  points: { index: number; at: number; error: boolean }[];
  errors: number;
}

export interface Journey {
  lanes: Lane[];
  from: number;
  to: number;
  /** Where the id turned up, most often first: a field, or the text of the message. */
  foundIn: { field: string; count: number }[];
}

const LEVEL = ["level", "log.level", "severity", "loglevel", "level_name"];
const STATUS = ["httpStatusCode", "httpStatus", "http_status", "status", "response_status", "http.response.status_code"];

/**
 * A line that reports a failure: a level of error or worse — named, or the syslog number
 * Graylog keeps — or a response status of 500 and up.
 */
export function isFailure(row: Record<string, unknown>): boolean {
  for (const name of LEVEL) {
    const v = row[name];
    if (v == null || v === "") continue;
    if (typeof v === "number" || /^\d+$/.test(String(v))) return Number(v) <= 3;
    return /^(err|error|crit|critical|alert|emerg|emergency|fatal|panic)$/i.test(String(v));
  }
  for (const name of STATUS) {
    const n = Number(row[name]);
    if (Number.isFinite(n) && n >= 100) return n >= 500;
  }
  return false;
}

/** Which stream a row came from, in the name the source gives it. */
function streamOf(row: Record<string, unknown>): string {
  const s = row.streams;
  if (Array.isArray(s)) return s.map(String).join(", ") || "unknown";
  return s ? String(s) : "unknown";
}

export function journeyOf(rows: Record<string, unknown>[], id: string): Journey | null {
  const lanes = new Map<string, Lane>();
  const found = new Map<string, number>();
  const needle = id.toLowerCase();
  let from = Infinity;
  let to = -Infinity;
  rows.forEach((row, index) => {
    const at = new Date(String(row.timestamp ?? "")).getTime();
    if (Number.isNaN(at)) return;
    from = Math.min(from, at);
    to = Math.max(to, at);
    const stream = streamOf(row);
    let lane = lanes.get(stream);
    if (!lane) lanes.set(stream, (lane = { stream, points: [], errors: 0 }));
    const error = isFailure(row);
    lane.points.push({ index, at, error });
    if (error) lane.errors++;
    for (const [field, value] of Object.entries(row)) {
      if (field === "timestamp" || field === "streams" || value == null || typeof value === "object") continue;
      if (String(value).toLowerCase().includes(needle)) found.set(field, (found.get(field) ?? 0) + 1);
    }
  });
  if (!lanes.size) return null;
  return {
    // the stream that spoke first leads, which is usually where the story starts
    lanes: [...lanes.values()].sort((a, b) => a.points[0].at - b.points[0].at),
    from,
    to,
    foundIn: [...found].map(([field, count]) => ({ field, count })).sort((a, b) => b.count - a.count || a.field.localeCompare(b.field)),
  };
}

/** Where on a lane, from 0 to 100, an instant falls. A journey of one instant sits in the middle. */
export function position(at: number, from: number, to: number): number {
  return to > from ? ((at - from) / (to - from)) * 100 : 50;
}
