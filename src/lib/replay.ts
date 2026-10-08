// A logged request, sent again somewhere safe, and its answer set beside the one in the log.
// "Did I fix it?" is otherwise a deploy and a wait; this is the same request against stage, a
// minute later. What authenticates it is never taken from the log: those headers come out
// empty, to be filled in by whoever is sending it, and nothing typed there is kept.
import type { LoggedRequest } from "./curl";

/** Headers the connection itself decides, which would be wrong copied from another one. */
const HOP =
  /^(host|content-length|connection|transfer-encoding|accept-encoding|keep-alive|upgrade|te|trailer|x-forwarded-.*|x-real-ip|forwarded|cf-.*|x-amzn-.*)$/i;

/** Where the request goes: its path and query, on the base it is being sent to. */
export function targetOf(url: string, base: string): string {
  const root = base.trim().replace(/\/+$/, "");
  const path = /^https?:\/\//i.test(url) ? url.replace(/^https?:\/\/[^/]+/i, "") || "/" : url;
  return `${root}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** The headers as lines to edit: a secret's value left empty, the connection's own left out. */
export function headerLines(headers: LoggedRequest["headers"]): string {
  return headers
    .filter((h) => !HOP.test(h.name))
    .map((h) => `${h.name}: ${h.secret ? "" : h.value}`)
    .join("\n");
}

/** The edited lines back as headers. A line without a value is not sent. */
export function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (name && value && !HOP.test(name)) out[name] = value;
  }
  return out;
}

/** A method that changes something on the other end, which is worth a second look before sending. */
export function writes(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

/** A body as structure when it is JSON, so two of them can be compared leaf by leaf. */
export function asJson(body: string | undefined): Record<string, unknown> | null {
  if (!body) return null;
  try {
    const v = JSON.parse(body) as unknown;
    return v && typeof v === "object" ? (Array.isArray(v) ? { "": v } : (v as Record<string, unknown>)) : null;
  } catch {
    return null;
  }
}
