// A set-up in one file: the connections and the projects built on them, for handing to someone
// who has just installed Flux. What a project is — its name, its streams, its repository — is
// the same for everybody on a team, and assembling it by hand is an afternoon.
//
// What it never carries is a token. `connections.json` is a credential (docs/adr/0005) and a
// file made to be sent is the last place one belongs: a connection arrives as a name and a URL,
// and whoever receives it pastes their own token into it.
import type { SourceKind } from "./datasource";
import type { Connection, Project, Settings } from "./settings";
import type { SavedQuery } from "./queries";

export const BUNDLE_FORMAT = 1;

export interface Bundle {
  /** Marks the file as one of these, and says which shape it is. */
  flux: typeof BUNDLE_FORMAT;
  exportedAt: string;
  /** `kind` is absent in files from before a connection named its source: those are Graylog. */
  connections: { id: string; name: string; kind?: SourceKind; url: string }[];
  projects: { name: string; connectionId: string; streams: string[]; github?: string; sourcePrefix?: string }[];
  /** The team's saved queries on those projects' streams. Absent in files from before they travelled. */
  queries?: { name: string; query: string; connectionId: string; streamIds: string[]; streamLabel: string; rangeSeconds: number }[];
}

/**
 * The chosen projects, the connections they stand on, and — when asked — the saved queries that
 * search only those projects' streams. Nothing that authenticates.
 */
export function makeBundle(settings: Settings, projectIds: string[], at = new Date(), saved: SavedQuery[] = []): Bundle {
  const projects = settings.projects.filter((p) => projectIds.includes(p.id));
  const used = new Set(projects.map((p) => p.connectionId));
  // a query is the team's when every stream it searches is one being handed over
  const streams = new Set(projects.flatMap((p) => p.streams.map((s) => `${p.connectionId}|${s}`)));
  const queries = saved
    .filter((q) => used.has(q.connId) && q.streamIds.length && q.streamIds.every((s) => streams.has(`${q.connId}|${s}`)))
    .map((q) => ({
      name: q.name,
      query: q.query,
      connectionId: q.connId,
      streamIds: [...q.streamIds],
      streamLabel: q.streamLabel,
      rangeSeconds: q.rangeSeconds,
    }));
  return {
    ...(queries.length ? { queries } : {}),
    flux: BUNDLE_FORMAT,
    exportedAt: at.toISOString(),
    connections: settings.connections.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, name: c.name, kind: c.kind, url: c.url })),
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
      b.projects.every((p) => typeof p?.name === "string" && typeof p.connectionId === "string" && Array.isArray(p.streams)) &&
      (b.queries === undefined ||
        (Array.isArray(b.queries) &&
          b.queries.every((q) => typeof q?.query === "string" && typeof q.connectionId === "string" && Array.isArray(q.streamIds))));
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
  /** Saved queries the file brought that were not here yet. */
  queries: SavedQuery[];
}

/**
 * The file folded into what is already set up. A connection is the one already here when the
 * URL is the same — the same Graylog is the same Graylog, whatever either side called it — and
 * a new one otherwise, with an empty token. A project already here by name on that connection
 * gains the streams it did not have, rather than arriving twice.
 */
export function mergeBundle(
  settings: Settings,
  bundle: Bundle,
  id: () => string = () => crypto.randomUUID(),
  saved: SavedQuery[] = [],
  at = Math.floor(Date.now() / 1000),
): Merged {
  const connections = [...settings.connections];
  const needToken: Connection[] = [];
  const localId = new Map<string, string>();

  for (const c of bundle.connections) {
    const here = connections.find((x) => sameUrl(x.url, c.url));
    if (here) {
      localId.set(c.id, here.id);
      continue;
    }
    const added: Connection = { id: id(), name: c.name, kind: c.kind ?? "graylog", url: c.url, token: "" };
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

  // a query already here — the same line, under the same name, on the same connection — is not
  // added again; neither is one on a connection the file does not name
  const queries: SavedQuery[] = [];
  for (const q of bundle.queries ?? []) {
    const connId = localId.get(q.connectionId);
    if (!connId) continue;
    const twin = (x: { connId: string; name: string; query: string }) => x.connId === connId && x.name === q.name && x.query === q.query;
    if (saved.some(twin) || queries.some(twin)) continue;
    queries.push({
      id: id(),
      name: q.name,
      query: q.query,
      connId,
      streamIds: [...q.streamIds],
      streamLabel: q.streamLabel,
      rangeSeconds: q.rangeSeconds,
      savedAt: at,
    });
  }

  return { settings: { ...settings, connections, projects }, connectionsAdded: needToken.length, projectsAdded, projectsGrown, needToken, queries };
}

/** A name that says what the file is, and whose. */
export function bundleName(at = new Date()): string {
  return `flux-setup-${at.toISOString().slice(0, 10)}.json`;
}
