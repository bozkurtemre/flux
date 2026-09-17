#!/usr/bin/env node
// The update manifest. One file, read by every installed copy: what the newest version is,
// where its package lives, how long it waits before being offered, and the signature that
// makes the whole arrangement safe to serve from a public bucket.
//   node scripts/manifest.mjs <version> <signature-file> <package-url> [soak-minutes]
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
const platform = { signature, url };

process.stdout.write(
  JSON.stringify(
    {
      version,
      notes,
      pub_date: new Date().toISOString(),
      soakMinutes: Number(soak),
      platforms: { "darwin-aarch64": platform, "darwin-x86_64": platform },
    },
    null,
    2,
  ) + "\n",
);
