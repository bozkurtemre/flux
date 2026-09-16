#!/usr/bin/env node
// Single source of truth for the app version.
//   node scripts/version.mjs              print the current version
//   node scripts/version.mjs 1.2.3        set an exact version
//   node scripts/version.mjs patch|minor|major
// Writes package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json, then
// refreshes Cargo.lock so the four never drift apart.
//
// Every edit is a targeted string replacement rather than a re-serialisation, so the
// files keep whatever formatting Prettier gave them.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PKG = "package.json";
const CARGO = "src-tauri/Cargo.toml";
const CONF = "src-tauri/tauri.conf.json";

const current = JSON.parse(readFileSync(PKG, "utf8")).version;
const arg = process.argv[2];

if (!arg) {
  console.log(current);
  process.exit(0);
}

const next = (() => {
  if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(arg)) return arg;
  const [major, minor, patch] = current.split(".").map(Number);
  if (arg === "major") return `${major + 1}.0.0`;
  if (arg === "minor") return `${major}.${minor + 1}.0`;
  if (arg === "patch") return `${major}.${minor}.${patch + 1}`;
  console.error(`Expected a semver string or patch|minor|major, got "${arg}"`);
  process.exit(1);
})();

/** Replace the first occurrence, and fail loudly rather than silently writing nothing. */
function replaceOnce(path, pattern, replacement) {
  const before = readFileSync(path, "utf8");
  const after = before.replace(pattern, replacement);
  if (after === before) {
    console.error(`${path}: no version field matched ${pattern}`);
    process.exit(1);
  }
  writeFileSync(path, after);
}

replaceOnce(PKG, new RegExp(`("version":\\s*)"${current}"`), `$1"${next}"`);
replaceOnce(CONF, new RegExp(`("version":\\s*)"${current}"`), `$1"${next}"`);
// only the [package] version, never a dependency's
replaceOnce(CARGO, new RegExp(`(\\[package\\][\\s\\S]*?\\nversion = )"${current}"`), `$1"${next}"`);

// resolving metadata rewrites Cargo.lock without compiling; --no-deps would skip resolution
execFileSync("cargo", ["metadata", "--format-version", "1", "--manifest-path", CARGO], { stdio: "ignore" });

console.log(next);
