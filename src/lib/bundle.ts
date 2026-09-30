// A set-up in one file: the connections and the projects built on them, for handing to someone
// who has just installed Flux. What a project is — its name, its streams, its repository — is
// the same for everybody on a team, and assembling it by hand is an afternoon.
//
// What it never carries is a token. `connections.json` is a credential (docs/adr/0005) and a
// file made to be sent is the last place one belongs: a connection arrives as a name and a URL,
// and whoever receives it pastes their own token into it.
import type { Connection, Project, Settings } from "./settings";

export const BUNDLE_FORMAT = 1;

export interface Bundle {
  /** Marks the file as one of these, and says which shape it is. */
  flux: typeof BUNDLE_FORMAT;
  exportedAt: string;
  connections: { id: string; name: string; url: string }[];
  projects: { name: string; connectionId: string; streams: string[]; github?: string; sourcePrefix?: string }[];
}

/** The chosen projects, and the connections they stand on — and nothing that authenticates. */
export function makeBundle(settings: Settings, projectIds: string[], at = new Date()): Bundle {
  const projects = settings.projects.filter((p) => projectIds.includes(p.id));
  const used = new Set(projects.map((p) => p.connectionId));
  return {
    flux: BUNDLE_FORMAT,
    exportedAt: at.toISOString(),
    connections: settings.connections.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, name: c.name, url: c.graylogUrl })),
    projects: projects.map((p) => ({
      name: p.name,
      connectionId: p.connectionId,
      streams: [...p.streams],
      ...(p.github ? { github: p.github } : {}),
    })),
  };
}

/** A bundle, or null for a file that is not one — the reason is not worth more than that. */
export function readBundle(text: string): Bundle | null {
  try {
    const b = JSON.parse(text) as Partial<Bundle>;
    if (b.flux !== BUNDLE_FORMAT || !Array.isArray(b.connections) || !Array.isArray(b.projects)) return null;
    const ok =
      b.connections.every((c) => typeof c?.id === "string" && typeof c.url === "string") &&
      b.projects.every((p) => typeof p?.name === "string" && typeof p.connectionId === "string" && Array.isArray(p.streams));
    return ok ? (b as Bundle) : null;
  } catch {
    return null;
  }
}

const sameUrl = (a: string, b: string) => a.trim().replace(/\/+$/, "").toLowerCase() === b.trim().replace(/\/+$/, "").toLowerCase();

export interface Merged {
  settings: Settings;
  connectionsAdded: number;
  projectsAdded: number;
  /** Projects that were already here, and gained streams from the file. */
  projectsGrown: number;
  /** Connections that came without a token, which is all of the new ones. */
  needToken: Connection[];
}

/**
 * The file folded into what is already set up. A connection is the one already here when the
 * URL is the same — the same Graylog is the same Graylog, whatever either side called it — and
 * a new one otherwise, with an empty token. A project already here by name on that connection
 * gains the streams it did not have, rather than arriving twice.
 */
export function mergeBundle(settings: Settings, bundle: Bundle, id: () => string = () => crypto.randomUUID()): Merged {
  const connections = [...settings.connections];
  const needToken: Connection[] = [];
  const localId = new Map<string, string>();

  for (const c of bundle.connections) {
    const here = connections.find((x) => sameUrl(x.graylogUrl, c.url));
    if (here) {
      localId.set(c.id, here.id);
      continue;
    }
    const added: Connection = { id: id(), name: c.name, graylogUrl: c.url, graylogToken: "" };
    connections.push(added);
    needToken.push(added);
    localId.set(c.id, added.id);
  }

  const projects: Project[] = settings.projects.map((p) => ({ ...p, streams: [...p.streams] }));
  let projectsAdded = 0;
  let projectsGrown = 0;
  for (const p of bundle.projects) {
    const connectionId = localId.get(p.connectionId);
    if (!connectionId) continue;
    const here = projects.find((x) => x.connectionId === connectionId && x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
    if (here) {
      const missing = p.streams.filter((s) => !here.streams.includes(s));
      if (missing.length) {
        here.streams.push(...missing);
        projectsGrown += 1;
      }
      continue;
    }
    projects.push({
      id: id(),
      connectionId,
      name: p.name,
      streams: [...p.streams],
      ...(p.github ? { github: p.github } : {}),
      ...(p.sourcePrefix ? { sourcePrefix: p.sourcePrefix } : {}),
    });
    projectsAdded += 1;
  }

  return { settings: { ...settings, connections, projects }, connectionsAdded: needToken.length, projectsAdded, projectsGrown, needToken };
}

/** A name that says what the file is, and whose. */
export function bundleName(at = new Date()): string {
  return `flux-setup-${at.toISOString().slice(0, 10)}.json`;
}
