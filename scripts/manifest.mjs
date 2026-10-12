#!/usr/bin/env node
// The update manifest. One file, read by every installed copy: what the newest version is,
// where its package lives, how long it waits before being offered, the oldest version still
// allowed to run, and the signature that makes the whole arrangement safe to serve from a public
// bucket.
//   node scripts/manifest.mjs <version> <signature-file> <package-url> [soak-minutes]
//
// PREVIOUS_MANIFEST is the manifest this one replaces. The minimum version and the notes of the
// last releases are carried from it, so a forced update stays forced after the next ordinary
// release, and a copy several versions behind can read everything it missed. FORCE=1 makes this
// release the minimum (docs/adr/0010).
//
// Both macOS keys point at the same universal package: the updater builds its platform key
// from the arch of the running binary, so a universal build has to answer to both.
import { readFileSync } from "node:fs";

const [version, signatureFile, url, soak = "10"] = process.argv.slice(2);
if (!version || !signatureFile || !url) {
  console.error("usage: manifest.mjs <version> <signature-file> <package-url> [soak-minutes]");
  process.exit(1);
}

const signature = readFileSync(signatureFile, "utf8").trim();
const notes = process.env.RELEASE_NOTES ?? "";
const force = process.env.FORCE === "1" || process.env.FORCE === "true";
const platform = { signature, url };

let previous = {};
try {
  previous = JSON.parse(process.env.PREVIOUS_MANIFEST || "{}");
} catch {
  // a first release, or a manifest that could not be read: nothing to carry forward
}

const minimumVersion = force ? version : previous.minimumVersion;
// the same version published again replaces its own entry rather than adding a second one
const history = [{ version, notes, ...(force ? { forced: true } : {}) }, ...(previous.history ?? []).filter((h) => h.version !== version)].slice(
  0,
  15,
);

process.stdout.write(
  JSON.stringify(
    {
      version,
      notes,
      pub_date: new Date().toISOString(),
      soakMinutes: Number(soak),
      ...(minimumVersion ? { minimumVersion } : {}),
      history,
      platforms: { "darwin-aarch64": platform, "darwin-x86_64": platform },
    },
    null,
    2,
  ) + "\n",
);
