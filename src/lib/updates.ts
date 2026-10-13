// Whether a published version may be offered yet, and whether it may be refused. The soak lives
// in the manifest so a release can be withdrawn before anyone is asked to install it (see
// docs/adr/0004); the updater plugin hands the front end only the version, the notes and the
// date, so the manifest is read here as well to learn how long this release wanted to wait and
// which version is the oldest still allowed to run (docs/adr/0010).

/** The update manifest, as far as Flux cares about it. */
export interface Manifest {
  version: string;
  notes?: string;
  pub_date?: string;
  /** Minutes to wait after publication before offering it. Absent means the default. */
  soakMinutes?: number;
  /**
   * The oldest version allowed to keep running. A copy older than this cannot be used until
   * it updates. Carried from release to release, so a forced update stays forced after the
   * next ordinary one.
   */
  minimumVersion?: string;
  /** The last releases' notes, newest first, so a copy several versions behind can read them all. */
  history?: { version: string; notes: string; forced?: boolean }[];
}

export const DEFAULT_SOAK_MINUTES = 10;

/**
 * A version is offerable once it has been downloadable for longer than its soak. A manifest
 * with no date, or an unreadable one, is offerable: a missing field should not be able to
 * hide every future release.
 */
export function offerable(manifest: Manifest, now: Date, fallback = DEFAULT_SOAK_MINUTES): boolean {
  const published = manifest.pub_date ? Date.parse(manifest.pub_date) : NaN;
  if (Number.isNaN(published)) return true;
  const soak = manifest.soakMinutes ?? fallback;
  return now.getTime() - published >= soak * 60_000;
}

/** -1, 0 or 1, comparing `1.2.10` and `1.2.9` as versions rather than as text. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/, "")
      .split(/[.+-]/)
      .slice(0, 3)
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

/**
 * Whether the running version may not be used any more: older than the manifest's minimum,
 * with a newer version on offer to update to. Still soaking is not forced yet — a forced
 * release can be wrong too, and withdrawing it must stay possible.
 */
export function forced(manifest: Manifest, running: string, now: Date): boolean {
  if (!manifest.minimumVersion) return false;
  if (compareVersions(running, manifest.minimumVersion) >= 0) return false;
  return compareVersions(manifest.version, running) > 0 && offerable(manifest, now);
}

/** What changed between the running version and the one on offer, newest first. */
export function notesSince(manifest: Manifest, running: string): { version: string; notes: string; forced?: boolean }[] {
  const since = (manifest.history ?? []).filter((h) => compareVersions(h.version, running) > 0);
  if (since.length) return since;
  return manifest.notes ? [{ version: manifest.version, notes: manifest.notes }] : [];
}

/**
 * What CHANGELOG.md says about one version: its section, up to the next heading of the same
 * level. A version the changelog does not name — a build ahead of its release — gets the newest
 * section instead, which is what it is closest to.
 */
export function changelogSection(changelog: string, version: string): { version: string; notes: string } | null {
  const headings = [...changelog.matchAll(/^##\s*\[?v?(\d+\.\d+\.\d+)\]?.*$/gm)];
  if (!headings.length) return null;
  const at = headings.findIndex((h) => compareVersions(h[1], version) === 0);
  const chosen = headings[at >= 0 ? at : 0];
  const start = (chosen.index ?? 0) + chosen[0].length;
  const next = headings.find((h) => (h.index ?? 0) > (chosen.index ?? 0));
  return { version: chosen[1], notes: changelog.slice(start, next?.index ?? changelog.length).trim() };
}

/** A version's notes in a few words, for the pill on the sign-in screen: the first thing added,
 *  its bold name if it has one, else its first clause. Null when the notes add nothing. */
export function headline(notes: string): string | null {
  const added = notes.split(/^###\s+/m).find((s) => /^Added/.test(s));
  const item = added?.match(/^-\s+(.+)$/m)?.[1];
  if (!item) return null;
  const text = item.match(/\*\*(.+?)\*\*/)?.[1] ?? item.split(/[:.;—]/)[0];
  const plain = text.replace(/[*`]/g, "").trim();
  return plain.length > 42 ? `${plain.slice(0, 40).trimEnd()}…` : plain;
}
