// Two log rows, side by side, down to the leaves. A request that worked and one that did not
// usually differ in two fields out of sixty, and reading sixty to find two is the part worth
// taking away: the difference is worked out here, over the same structure the inspector shows —
// a JSON message opened up into its fields.

/** Log fields routinely hold a JSON blob inside a string; show it as structure. */
export function expand(v: unknown, depth = 0): unknown {
  if (depth > 8) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.length > 1 && ((t[0] === "{" && t.endsWith("}")) || (t[0] === "[" && t.endsWith("]")))) {
      try {
        return expand(JSON.parse(t), depth + 1);
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => expand(x, depth + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x, depth + 1)]));
  return v;
}

/** Every leaf, by its path: `context.params.headers.Accept[0]`. An empty object is a leaf too. */
export function flatten(v: unknown, path = "", out = new Map<string, unknown>()): Map<string, unknown> {
  if (Array.isArray(v) && v.length) v.forEach((x, i) => flatten(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length)
    for (const [k, x] of Object.entries(v)) flatten(x, path ? `${path}.${k}` : k, out);
  else out.set(path, v);
  return out;
}

export type Change = "same" | "changed" | "removed" | "added";

export interface Line {
  path: string;
  a?: unknown;
  b?: unknown;
  change: Change;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The two rows, leaf by leaf: what only the first has, what only the second has, what both have
 * but differently, and what they agree on. In the first row's order, the second's new leaves
 * after it.
 */
export function diffRows(a: Record<string, unknown>, b: Record<string, unknown>): Line[] {
  const left = flatten(expand(a));
  const right = flatten(expand(b));
  const lines: Line[] = [];
  for (const [path, value] of left) {
    if (!right.has(path)) lines.push({ path, a: value, change: "removed" });
    else lines.push({ path, a: value, b: right.get(path), change: same(value, right.get(path)) ? "same" : "changed" });
  }
  for (const [path, value] of right) if (!left.has(path)) lines.push({ path, b: value, change: "added" });
  return lines;
}

/** How many of each, for the header. */
export function tally(lines: Line[]): Record<Change, number> {
  const out: Record<Change, number> = { same: 0, changed: 0, removed: 0, added: 0 };
  for (const l of lines) out[l.change] += 1;
  return out;
}
