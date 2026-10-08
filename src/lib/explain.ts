// Why a stretch of the timeline is different from what came before it. A spike is rarely
// everything at once: it is one version, one provider, one host, one route. So the messages in
// the stretch are counted by the values of a few fields and set against the same counts just
// before it, and the values whose share moved the most come first. Honeycomb calls this
// BubbleUp; here it is two grouped counts per field, which every source can answer.

/** Fields that name nothing worth comparing: when a message arrived, what it said, which it is. */
const SKIP = /^(timestamp|@timestamp|message|full_message|_id|gl2_.*|streams|.*[_.-]?(id|uuid|hash|token)|.*time(stamp)?|.*_at)$/i;

/** At most this many fields are asked about, which is two searches each. */
export const FIELDS = 12;

/**
 * The fields worth asking about, chosen from the rows already on screen: carried by enough of
 * them to matter, and with few enough values that a share of one of them means something.
 */
export function candidateFields(rows: Record<string, unknown>[], limit = FIELDS): string[] {
  if (!rows.length) return [];
  const seen = new Map<string, Set<string>>();
  const carried = new Map<string, number>();
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (SKIP.test(field) || value == null || value === "" || typeof value === "object") continue;
      const text = String(value);
      if (text.length > 120) continue;
      let values = seen.get(field);
      if (!values) seen.set(field, (values = new Set()));
      values.add(text);
      carried.set(field, (carried.get(field) ?? 0) + 1);
    }
  }
  return [...seen]
    .filter(([field, values]) => values.size >= 2 && values.size <= 40 && (carried.get(field) ?? 0) >= rows.length * 0.2)
    .sort(([a], [b]) => (carried.get(b) ?? 0) - (carried.get(a) ?? 0) || a.localeCompare(b))
    .slice(0, limit)
    .map(([field]) => field);
}

/** One field's grouped counts over one window, and how many messages the window held. */
export interface Counted {
  field: string;
  values: { value: string; count: number }[];
  total: number;
}

export interface Explanation {
  field: string;
  value: string;
  /** The value's share of the messages in the stretch, and before it, from 0 to 1. */
  inside: number;
  before: number;
}

/**
 * The values whose share of the messages moved the most, most first. A value has to be a
 * noticeable part of the stretch, and to have moved by a noticeable amount: a value going
 * from 1% to 3% is not what anyone is looking for in a spike.
 */
export function explain(inside: Counted[], before: Counted[], limit = 15): Explanation[] {
  const out: Explanation[] = [];
  for (const now of inside) {
    if (!now.total) continue;
    const then = before.find((b) => b.field === now.field);
    const earlier = new Map((then?.values ?? []).map((v) => [v.value, v.count]));
    for (const v of now.values) {
      const share = v.count / now.total;
      const was = then?.total ? (earlier.get(v.value) ?? 0) / then.total : 0;
      if (share >= 0.05 && share - was >= 0.05) out.push({ field: now.field, value: v.value, inside: share, before: was });
    }
  }
  return out.sort((a, b) => b.inside - b.before - (a.inside - a.before)).slice(0, limit);
}

/** What the stretch is set against: the three times as long just before it. */
export function baselineOf(from: Date, to: Date): { from: Date; to: Date } {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - 3 * span), to: from };
}
