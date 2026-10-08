// Where a message is written in the code, and the change that wrote it there. A pattern's
// template keeps the words the code wrote literally and masks what it filled in, so the longest
// literal run is a string that sits in the source as it is: `git grep` finds the line, `git blame`
// the commit, and `gh` the pull request it came in with. A message made mostly of what was filled
// in has little literal left, and is said to be hard to find rather than guessed at.
import { sh } from "./curl";

/** Shorter than this, a literal matches too much of a codebase to point at one line. */
const LEAST = 8;

/**
 * The literal runs of a template worth searching for, longest first: the text between its
 * masks, with the punctuation a format string adds around a value trimmed off.
 */
export function literalsOf(template: string, limit = 2): string[] {
  return template
    .split(/<\w+>/)
    .map((s) => s.replace(/^[\s:=,;"'()[\]{}#-]+|[\s:=,;"'()[\]{}#-]+$/g, ""))
    .filter((s) => s.length >= LEAST)
    .sort((a, b) => b.length - a.length)
    .slice(0, limit);
}

export interface Hit {
  file: string;
  line: number;
  text: string;
}

/** A word a shell takes as it is, or quoted. */
const arg = (a: string) => (/^[\w./:=,@-]+$/.test(a) ? a : sh(a));

/** Every tracked line holding the literal, with its file and number, the vendored code left out. */
export function grepCommand(folder: string, literal: string): string {
  return [
    "git",
    "-C",
    folder,
    "grep",
    "-n",
    "-I",
    "-F",
    "--full-name",
    "-e",
    literal,
    "--",
    ".",
    ":!vendor",
    ":!node_modules",
    ":!*.lock",
    ":!*.min.js",
  ]
    .map(arg)
    .join(" ");
}

/** `path:line:text`, as git grep writes it, back into hits. */
export function readGrep(out: string): Hit[] {
  const hits: Hit[] = [];
  for (const line of out.split("\n")) {
    const m = /^(.+?):(\d+):(.*)$/.exec(line);
    if (m) hits.push({ file: m[1], line: Number(m[2]), text: m[3].trim() });
  }
  return hits;
}

/** A line that writes a log or throws: the likeliest of several lines holding the same words. */
const WRITES =
  /(->|::)(log|error|warning|warn|info|notice|debug|critical|alert|emergency)\s*\(|logger|Log::|\blog\(|report\(|throw\s+new|Exception\(/i;

/** The hits worth showing, the ones that write a log first, tests last. */
export function rank(hits: Hit[]): Hit[] {
  const score = (h: Hit) => (WRITES.test(h.text) ? 0 : 2) + (/(^|\/)tests?\//i.test(h.file) ? 1 : 0);
  return [...hits].sort((a, b) => score(a) - score(b) || a.file.localeCompare(b.file) || a.line - b.line);
}

/** Who last changed the line, and in which commit, in one line: `sha\tauthor\tdate\tsubject`. */
export function blameCommand(folder: string, hit: Hit): string {
  const blame = ["git", "-C", folder, "blame", "-L", `${hit.line},${hit.line}`, "--porcelain", "--", hit.file].map(arg).join(" ");
  // the porcelain's first word is the commit; the log names it the way a person reads one
  return `sha=$(${blame} | head -1 | cut -d' ' -f1) && git -C ${arg(folder)} log -1 --date=short --format='%H%x09%an%x09%ad%x09%s' "$sha"`;
}

export interface Blame {
  sha: string;
  author: string;
  date: string;
  subject: string;
}

export function readBlame(out: string): Blame | null {
  const [sha, author, date, ...subject] = out.trim().split("\t");
  // an uncommitted line blames to the all-zero commit, which has no story to tell
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha) || /^0+$/.test(sha)) return null;
  return { sha, author: author ?? "", date: date ?? "", subject: subject.join("\t") };
}

/** The pull request a commit came in with, as `gh` finds it. */
export function prCommand(repo: string, sha: string): string {
  return ["gh", "pr", "list", "--repo", repo, "--state", "merged", "--search", sha, "--json", "number,title,url", "--limit", "1"].map(arg).join(" ");
}

export function readPr(json: string): { number: number; title: string; url: string } | null {
  try {
    const [pr] = JSON.parse(json) as { number?: number; title?: string; url?: string }[];
    return pr?.number && pr.url ? { number: pr.number, title: pr.title ?? "", url: pr.url } : null;
  } catch {
    return null;
  }
}
