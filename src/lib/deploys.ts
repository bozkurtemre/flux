// What changed in the code while the logs were changing. A project names its repository, and
// the pull requests merged into it are the moments something new could have started: drawn on
// the timeline, a spike that begins just after one is a question with half its answer.
//
// They are asked of GitHub through `gh`, the CLI already signed in on this machine, run in the
// login shell the terminal uses. Flux keeps no GitHub token of its own, and asks for none.
import { sh } from "./curl";

export interface Marker {
  at: string;
  label: string;
  url: string;
}

/** The `gh` call for the pull requests merged into a repository between two instants. */
export function mergesCommand(repo: string, from: Date, to: Date): string {
  const day = (d: Date) => d.toISOString().slice(0, 19) + "Z";
  const args = [
    "gh",
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    "merged",
    "--search",
    `merged:${day(from)}..${day(to)}`,
    "--json",
    "number,title,mergedAt,url",
    "--limit",
    "50",
  ];
  // a word made only of these reaches the command as it is; anything else is quoted
  return args.map((a) => (/^[\w./:=,-]+$/.test(a) ? a : sh(a))).join(" ");
}

/** What `gh` answered, as markers, oldest first; anything that is not a merged PR is left out. */
export function readMerges(json: string): Marker[] {
  try {
    const list = JSON.parse(json) as { number?: number; title?: string; mergedAt?: string; url?: string }[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((p) => p.mergedAt && p.url && !Number.isNaN(new Date(p.mergedAt).getTime()))
      .map((p) => ({ at: p.mergedAt!, label: `#${p.number ?? "?"} ${p.title ?? ""}`.trim(), url: p.url! }))
      .sort((a, b) => a.at.localeCompare(b.at));
  } catch {
    return [];
  }
}

/** How far along the timeline an instant is, 0–100, or null when it is outside it. */
export function along(at: string, from: string, to: string): number | null {
  const t = new Date(at).getTime();
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!(b > a) || t < a || t > b) return null;
  return ((t - a) / (b - a)) * 100;
}
