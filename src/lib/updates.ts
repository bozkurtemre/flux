// Whether a published version may be offered yet. The soak lives in the manifest so a
// release can be withdrawn before anyone is asked to install it (see docs/adr/0004); the
// updater plugin hands the front end only the version, the notes and the date, so the
// manifest is read here as well to learn how long this release wanted to wait.

/** The update manifest, as far as Flux cares about it. */
export interface Manifest {
  version: string;
  notes?: string;
  pub_date?: string;
  /** Minutes to wait after publication before offering it. Absent means the default. */
  soakMinutes?: number;
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
