// A view as a link: `flux://open?…`, pasted into a conversation and opened by whoever clicks
// it, in their own Flux. It names the Graylog by its URL rather than by what the sender called
// their connection — two people rarely name them alike — and carries the stream, the console
// line and the range. It never carries a token: the receiver's own connection answers it.

export interface Shared {
  /** The Graylog it was asked of, as its URL. */
  graylog: string;
  stream: string;
  /** What the stream was called there, for a tab title while the receiver's tree loads. */
  label?: string;
  query: string;
  /** The range, when the line does not name a window of its own. */
  seconds?: number;
}

export function linkFor(s: Shared): string {
  const q = new URLSearchParams({ graylog: s.graylog, stream: s.stream, query: s.query });
  if (s.label) q.set("label", s.label);
  if (s.seconds) q.set("seconds", String(s.seconds));
  return `flux://open?${q.toString()}`;
}

/** What a link asks for, or null for one that is not ours or not whole. */
export function readLink(link: string): Shared | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  // `flux://open?…` reads as host "open" in one parser and path "//open" in another
  if (url.protocol !== "flux:" || (url.hostname || url.pathname.replace(/^\/+/, "")) !== "open") return null;
  const graylog = url.searchParams.get("graylog");
  const stream = url.searchParams.get("stream");
  if (!graylog || !stream) return null;
  const seconds = Number(url.searchParams.get("seconds"));
  return {
    graylog,
    stream,
    label: url.searchParams.get("label") ?? undefined,
    query: url.searchParams.get("query") ?? "",
    ...(seconds > 0 ? { seconds } : {}),
  };
}

/** The connection here that answers for a Graylog, known by its URL. */
export function connectionFor<T extends { url: string }>(connections: T[], graylog: string): T | undefined {
  const plain = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
  return connections.find((c) => plain(c.url) === plain(graylog));
}
