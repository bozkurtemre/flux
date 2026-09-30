// A logged request, as a command that sends it again. A failing request is most of the time
// easiest understood by making it once more, and the log already holds everything it was:
// the method, where it went, its headers and its body — as fields of the row, or inside the
// JSON a message usually turns out to be.
//
// What authenticates it is left out unless asked for: the command is going to be pasted into
// a terminal, a conversation or a ticket, and a live token is the part nobody meant to share.

const METHOD = ["method", "http_method", "verb", "request_method"];
const URL = ["url", "full_url", "request_url", "uri", "request_uri", "route", "path", "request_path"];
const HOST = ["host", "hostname", "http_host", "server_name"];
const HEADERS = ["headers", "request_headers"];
const BODY = ["body", "request_body", "payload", "data"];

/** Where a request's parts are kept inside a JSON message, most specific first. */
const NESTS = ["request", "context.request", "context.params", "context", "params", ""];

const SECRET = /^(authorization|proxy-authorization|cookie|x-api-key|x-auth-token|api-key|x-access-token)$/i;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function at(obj: Obj, path: string): unknown {
  return path ? path.split(".").reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), obj) : obj;
}

/** The row with its message opened, if the message is JSON. */
function sources(row: Obj): Obj[] {
  const out: Obj[] = [row];
  const msg = row.message;
  if (typeof msg === "string" && msg.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(msg) as unknown;
      if (isObj(parsed)) out.push(parsed);
    } catch {
      /* a message that only looks like JSON */
    }
  }
  return out;
}

/** The first of these names that holds something, wherever in the row it is kept. */
function find(row: Obj, names: string[], want: (v: unknown) => boolean): unknown {
  for (const source of sources(row)) {
    for (const nest of NESTS) {
      const where = at(source, nest);
      if (!isObj(where)) continue;
      for (const name of names) {
        const key = Object.keys(where).find((k) => k.toLowerCase() === name);
        if (key && want(where[key])) return where[key];
      }
    }
  }
  return undefined;
}

const text = (v: unknown) => typeof v === "string" && v.trim() !== "" && v !== "-";

/** Single-quoted for a POSIX shell, the one quoting that survives $, ` and \ untouched. */
export const sh = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/**
 * The request a row describes, as `curl`, or null when the row does not describe one. A path
 * without a host is left relative to `$BASE`, which is honest about what the log did not say.
 */
export function curlOf(row: Obj, o: { secrets?: boolean } = {}): string | null {
  const method = find(row, METHOD, text);
  const target = find(row, URL, text);
  if (!method && !target) return null;

  let where = String(target ?? "/");
  if (!/^https?:\/\//i.test(where)) {
    const host = find(row, HOST, text);
    where = host
      ? `https://${String(host).replace(/\/+$/, "")}${where.startsWith("/") ? "" : "/"}${where}`
      : `$BASE${where.startsWith("/") ? "" : "/"}${where}`;
  }

  const parts = ["curl", "-X", String(method ?? "GET").toUpperCase()];
  // "$BASE" is meant to expand, so that one is double-quoted; everything else is literal
  parts.push(where.startsWith("$BASE") ? `"${where.replace(/(["\\`])/g, "\\$1")}"` : sh(where));

  const headers = find(row, HEADERS, isObj);
  if (isObj(headers)) {
    for (const [name, raw] of Object.entries(headers)) {
      // PHP and Symfony log a header as a list of its values
      const value = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
      parts.push("-H", sh(`${name}: ${!o.secrets && SECRET.test(name) ? "<redacted>" : value}`));
    }
  }

  const body = find(row, BODY, (v) => text(v) || isObj(v) || Array.isArray(v));
  if (body !== undefined) parts.push("--data-raw", sh(typeof body === "string" ? body : JSON.stringify(body)));

  return parts.join(" ");
}
