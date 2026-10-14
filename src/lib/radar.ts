// The deploy radar: for ten minutes after a pull request is merged into a project's repository,
// the island holds the project's error rate since the merge against the ten minutes before it.
// The merges are the ones the timeline already draws, asked of `gh` the same way.

export const RADAR_MINUTES = 10;

export interface Window {
  total: number;
  errors: number;
}

export const rate = (w: Window) => (w.total ? (w.errors / w.total) * 100 : 0);

const pct = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;

/** Worse means half as many failures again, and enough of them not to be noise. */
export function worse(before: Window, after: Window): boolean {
  return after.errors >= 5 && rate(after) > Math.max(rate(before) * 1.5, 0.5);
}

/** The island's line: before, after, and how long the radar has been watching. */
export function radarLine(before: Window, after: Window, sinceMs: number): string {
  const mins = Math.max(1, Math.round(sinceMs / 60_000));
  return `errors ${pct(rate(before))} → ${pct(rate(after))} · ${mins}m since merge`;
}

/** Whether a merge is still inside the radar's ten minutes. */
export const onRadar = (mergedAt: string, now: number) => now - new Date(mergedAt).getTime() < RADAR_MINUTES * 60_000;
