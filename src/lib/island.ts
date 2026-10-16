// What the island shows, as plain data: it lives in a window of its own, under the notch, and
// a window of its own has no store — the main window works the list out and hands it over.

export type IslandState = "running" | "following" | "alert" | "quiet" | "watching" | "mcp" | "update" | "deploy" | "regressed" | "done" | "failed";

export interface IslandItem {
  /** `run:<tab>`, `follow:<tab>`, `watch:<query>`, `mcp:<tool>`, `update:<version>`, `deploy:<project>|<pr url>` or `term:<terminal>`: what a click on the row goes back to. */
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
  quiet: { label: "gone quiet", color: "#e5534b" },
  watching: { label: "watching", color: "#4b8ef0" },
  mcp: { label: "MCP call", color: "#d97757" },
  update: { label: "update", color: "#a371f7" },
  deploy: { label: "deploy", color: "#3fb9c6" },
  regressed: { label: "errors up", color: "#e5534b" },
  done: { label: "done", color: "#5fb865" },
  failed: { label: "failed", color: "#e5534b" },
};

/** Worst first: the order the pill counts in and the colour it leads with. */
const ORDER: IslandState[] = ["alert", "regressed", "failed", "quiet", "running", "deploy", "done", "mcp", "update", "following", "watching"];

/** `4s`, `3m`, `2h` — how long since, or how long for. */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

/** `14s`, `2m 14s`: how long a command took, to the second. */
export function took(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** The pill's one line: the counts, worst first. */
export function headline(items: IslandItem[]): string {
  const words: Record<IslandState, string> = {
    alert: "with new matches",
    quiet: "gone quiet",
    running: "running",
    mcp: "MCP call",
    update: "update ready",
    deploy: "deploy on radar",
    regressed: "deploy with errors up",
    done: "command done",
    failed: "command failed",
    following: "following",
    watching: "watching",
  };
  return ORDER.map((s) => [s, items.filter((i) => i.state === s).length] as const)
    .filter(([, n]) => n)
    .map(([s, n]) => (s === "update" ? words[s] : `${n} ${words[s]}`))
    .join(" · ");
}

/** The colour the island leads with: whatever most needs looking at. */
export function lead(items: IslandItem[]): IslandState {
  return ORDER.find((s) => items.some((i) => i.state === s)) ?? "watching";
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
