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
