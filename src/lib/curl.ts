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
const STATUS = ["httpstatuscode", "httpstatus", "http_status", "status", "status_code", "response_status"];
const RESPONSE = ["response_body", "responsebody", "body", "content", "response"];
/** Where a response is kept: its own object first, the top of the row last. */
const RESPONSE_NESTS = ["response", "context.response", "context", ""];

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
function find(row: Obj, names: string[], want: (v: unknown) => boolean, nests = NESTS): unknown {
  for (const source of sources(row)) {
    for (const nest of nests) {
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

export interface LoggedRequest {
  method: string;
  /** Absolute when the log said where it went; otherwise a path, relative to wherever it is sent. */
  url: string;
  headers: { name: string; value: string; secret: boolean }[];
  body?: string;
}

/** The request a row describes, or null when the row does not describe one. */
export function requestOf(row: Obj): LoggedRequest | null {
  const method = find(row, METHOD, text);
  const target = find(row, URL, text);
  if (!method && !target) return null;

  let url = String(target ?? "/");
  if (!/^https?:\/\//i.test(url)) {
    const host = find(row, HOST, text);
    const path = url.startsWith("/") ? url : `/${url}`;
    url = host ? `https://${String(host).replace(/\/+$/, "")}${path}` : path;
  }

  const headers: LoggedRequest["headers"] = [];
  const logged = find(row, HEADERS, isObj);
  if (isObj(logged)) {
    for (const [name, raw] of Object.entries(logged)) {
      // PHP and Symfony log a header as a list of its values
      headers.push({ name, value: Array.isArray(raw) ? raw.join(", ") : String(raw ?? ""), secret: SECRET.test(name) });
    }
  }

  const body = find(row, BODY, (v) => text(v) || isObj(v) || Array.isArray(v));
  return {
    method: String(method ?? "GET").toUpperCase(),
    url,
    headers,
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  };
}

/** What the service answered, as far as the row recorded it. */
export function responseOf(row: Obj): { status?: number; body?: string } {
  const status = Number(find(row, STATUS, (v) => Number.isFinite(Number(v)) && Number(v) >= 100, RESPONSE_NESTS));
  // a plain `body` at the top of the row is the request's: the response's is in its own
  // object, or a field that says it is the response's
  const holds = (v: unknown) => text(v) || isObj(v) || Array.isArray(v);
  const body = find(row, RESPONSE, holds, RESPONSE_NESTS.slice(0, 3)) ?? find(row, ["response_body", "responsebody"], holds, [""]);
  return {
    ...(Number.isFinite(status) ? { status } : {}),
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  };
}

/**
 * The request a row describes, as `curl`, or null when the row does not describe one. A path
 * without a host is left relative to `$BASE`, which is honest about what the log did not say.
 */
export function curlOf(row: Obj, o: { secrets?: boolean } = {}): string | null {
  const r = requestOf(row);
  if (!r) return null;
  const where = r.url.startsWith("/") ? `$BASE${r.url}` : r.url;
  const parts = ["curl", "-X", r.method];
  // "$BASE" is meant to expand, so that one is double-quoted; everything else is literal
  parts.push(where.startsWith("$BASE") ? `"${where.replace(/(["\\`])/g, "\\$1")}"` : sh(where));
  for (const h of r.headers) parts.push("-H", sh(`${h.name}: ${!o.secrets && h.secret ? "<redacted>" : h.value}`));
  if (r.body !== undefined) parts.push("--data-raw", sh(r.body));
  return parts.join(" ");
}
