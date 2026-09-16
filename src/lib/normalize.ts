const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const VERSION = /^v\d+(\.\d+)*$/i;

/**
 * Collapse one path segment when it is an identifier rather than a route name.
 * Whole segments only: a substring rule turns `/notification/68aa99f8/deliver` into
 * `/notification/:idaa99f8/deliver`, which is how endpoint cardinality explodes.
 */
export function normalizeSegment(seg: string): string {
  if (!seg || VERSION.test(seg)) return seg;
  if (UUID.test(seg)) return ":uuid";
  if (/^[0-9a-f]{24}$/i.test(seg)) return ":oid";
  if (/^\d+$/.test(seg)) return ":id";
  if (/^[0-9a-f]{8,}$/i.test(seg)) return ":hex";
  if (/^[A-Z0-9][A-Z0-9_-]{5,}$/.test(seg) && /\d/.test(seg)) return ":code"; // package or campaign codes
  if (/\d{5,}/.test(seg)) return ":id"; // embedded timestamps, `lc-1789401992-x.json.tr`
  return seg;
}

/**
 * The template an endpoint is grouped under: drop the query string, apply any explicit
 * rules, then collapse identifier segments.
 */
export function makeNormalizer(rules: [string, string][] = []) {
  const compiled = rules.map(([re, rep]) => [new RegExp(re, "g"), rep] as const);
  return (path: string) => {
    let p = path.split("?")[0] || "/";
    for (const [re, rep] of compiled) p = p.replace(re, rep);
    if (p === "/") return p;
    const out = p.split("/").map(normalizeSegment).join("/");
    return out.length > 1 && out.endsWith("/") ? out.slice(0, -1) : out;
  };
}
