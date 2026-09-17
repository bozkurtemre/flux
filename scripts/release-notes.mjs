#!/usr/bin/env node
// The text a release is announced with: what the changelog says about this version, then the
// commits since the previous tag. Written once and used twice — the GitHub release body and
// the update manifest the app shows.
//   node scripts/release-notes.mjs 0.3.0
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const version = process.argv[2]?.replace(/^v/, "");
if (!version) {
  console.error("usage: release-notes.mjs <version>");
  process.exit(1);
}

/** The section of CHANGELOG.md for this version, if it has one. */
function changelogSection() {
  let text;
  try {
    text = readFileSync("CHANGELOG.md", "utf8");
  } catch {
    return "";
  }
  // a heading naming this version, up to the next heading of the same level
  const heading = new RegExp(`^(#{2,3})\\s*\\[?v?${version.replace(/\./g, "\\.")}\\]?.*$`, "m");
  const start = text.match(heading);
  if (!start) return "";
  const from = text.indexOf(start[0]) + start[0].length;
  const rest = text.slice(from);
  const next = rest.search(new RegExp(`^#{1,${start[1].length}}\\s`, "m"));
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

/** Subjects since the previous tag, which read as a list now that they are conventional. */
function commitsSincePreviousTag() {
  // stderr is silenced: the first release has no previous tag and says so loudly
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  // the tag exists when the release workflow runs; before that, previewing from HEAD is
  // exactly what someone about to cut the release wants
  let head;
  try {
    git("rev-parse", "--verify", `v${version}`);
    head = `v${version}`;
  } catch {
    head = "HEAD";
  }
  let range;
  try {
    const previous = git("describe", "--tags", "--abbrev=0", `${head}^`);
    range = `${previous}..${head}`;
  } catch {
    range = head;
  }
  const log = git("log", "--no-merges", "--format=%s", range);
  return log
    .split("\n")
    .filter((line) => line && !/^chore\(release\):/.test(line))
    .map((line) => `- ${line}`)
    .join("\n");
}

const section = changelogSection();
const commits = commitsSincePreviousTag();
const notes = [section, section && commits ? "### Commits" : "", commits].filter(Boolean).join("\n\n");
process.stdout.write(notes ? `${notes}\n` : `Flux ${version}\n`);
