// What the island shows, as plain data: it lives in a window of its own, under the notch, and
// a window of its own has no store — the main window works the list out and hands it over.

export type IslandState = "running" | "following" | "alert" | "watching";

export interface IslandItem {
  /** `run:<tab>`, `follow:<tab>` or `watch:<query>`: what a click on the row goes back to. */
  key: string;
  title: string;
  detail: string;
  state: IslandState;
  /** When it last did something, for the column on the right. */
  at?: number;
}

export const CHIP: Record<IslandState, { label: string; color: string }> = {
  running: { label: "running", color: "#e5a33a" },
  following: { label: "following", color: "#5fb865" },
  alert: { label: "new matches", color: "#e5534b" },
  watching: { label: "watching", color: "#4b8ef0" },
};

/** `4s`, `3m`, `2h` — how long since, or how long for. */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

/** The pill's one line: the counts, worst first. */
export function headline(items: IslandItem[]): string {
  const n = (s: IslandState) => items.filter((i) => i.state === s).length;
  return [
    n("alert") && `${n("alert")} with new matches`,
    n("running") && `${n("running")} running`,
    n("following") && `${n("following")} following`,
    n("watching") && `${n("watching")} watching`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The colour the island leads with: whatever most needs looking at. */
export function lead(items: IslandItem[]): IslandState {
  for (const s of ["alert", "running", "following", "watching"] as const) if (items.some((i) => i.state === s)) return s;
  return "watching";
}

/**
 * Where the island sits on a screen: centred, flush with the top, so that on a notched display
 * it grows out of the camera housing. `inset` is how tall the menu bar is there, which on those
 * displays is the notch.
 */
export function placement(
  monitor: { x: number; y: number; width: number; scale: number; workTop: number },
  size: { width: number; height: number },
): { x: number; y: number; inset: number } {
  const inset = Math.max(0, Math.round((monitor.workTop - monitor.y) / monitor.scale));
  const x = Math.round(monitor.x / monitor.scale + (monitor.width / monitor.scale - size.width) / 2);
  return { x, y: Math.round(monitor.y / monitor.scale), inset };
}
