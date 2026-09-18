// Turning an instant into what a date field shows, and back. `datetime-local` has no time
// zone of its own: it shows whatever is typed into it, so the zone is ours to apply — the one
// the grid is already showing timestamps in, or nothing about the two would line up.

export type Zone = "local" | "utc";

/** What `<input type="datetime-local">` takes: `YYYY-MM-DDTHH:mm:ss`, to the second. */
export function toInput(date: Date, zone: Zone): string {
  const shifted = zone === "utc" ? date : new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 19);
}

/** The instant a date field means, read in the same zone it was shown in. */
export function fromInput(text: string, zone: Zone): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text)) return null;
  const withSeconds = text.length === 16 ? `${text}:00` : text;
  const date = new Date(zone === "utc" ? `${withSeconds}Z` : withSeconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `YYYY-MM-DD` for a day, from its own parts: no zone shifts on the way. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The six weeks a month is drawn in, Monday first: the days before it and after it are there
 * too, because a calendar with holes is harder to read than one with neighbours.
 */
export function monthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // Monday before the first, or the first itself
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** A day and a time of day, as a date field would have them. */
export const atTime = (day: string, time: string) => `${day}T${time}`;

/** The two halves of what a date field holds. */
export function splitInput(text: string): { day: string; time: string } {
  const [day, time] = text.split("T");
  return { day, time: (time ?? "00:00:00").slice(0, 8).padEnd(8, "0") };
}
