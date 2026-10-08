// Why a search found nothing. `route:/v2/orders* AND status:500 AND iccid:8990…` coming back
// empty says nothing about which part is wrong: a field misspelt, a value that never occurs, or
// a window with no traffic in it. So the search is counted again with each of its terms left
// out in turn, and the term whose absence brings rows back is the one to look at.

/**
 * The terms joined by a top-level AND, in order, a `NOT` kept with the term it negates.
 * Quotes, brackets and parentheses are respected; a search with a top-level OR is one term,
 * because leaving out half of an OR is a different question.
 */
export function andTerms(search: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  let or = false;
  for (let i = 0; i < search.length; i++) {
    const c = search[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (quoted) continue;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && /\s/.test(c)) {
      const rest = search.slice(i);
      const and = /^\s+AND\s+/.exec(rest);
      if (and) {
        parts.push(search.slice(start, i));
        i += and[0].length - 1;
        start = i + 1;
      } else if (/^\s+(OR|\|\|)\s+/.test(rest)) or = true;
    }
  }
  parts.push(search.slice(start));
  const terms = parts.map((p) => p.trim()).filter(Boolean);
  return or ? [search.trim()] : terms;
}

/** The search with one term left out; nothing left is everything. */
export function without(terms: string[], index: number): string {
  return terms.filter((_, i) => i !== index).join(" AND ") || "*";
}

/** The field a term searches, if it names one: `route:/x`, `NOT level:INFO`, `_exists_:iccid`. */
export function fieldOf(term: string): string | null {
  const t = term.replace(/^(NOT\s+|-|\+)/, "").replace(/^\(+/, "");
  const exists = /^_exists_:([\w.@-]+)/.exec(t);
  if (exists) return exists[1];
  const named = /^([\w.@-]+):/.exec(t);
  return named && named[1] !== "_exists_" ? named[1] : null;
}

/** Edit distance, bounded: a misspelt field is a letter or two away from the real one. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const was = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = was;
    }
  }
  return row[b.length];
}

/**
 * Whether a field is one the stream has, and if not the nearest one it does: the same name
 * in another case first, then the closest a couple of letters away. Unknown without a field
 * list, rather than wrongly called missing.
 */
export function checkField(field: string, known: string[]): { known: boolean; suggest?: string } {
  if (!known.length || known.includes(field)) return { known: true };
  const lower = field.toLowerCase();
  const same = known.find((k) => k.toLowerCase() === lower);
  if (same) return { known: false, suggest: same };
  let best: string | undefined;
  let score = 3;
  for (const k of known) {
    const d = distance(lower, k.toLowerCase());
    if (d < score) [best, score] = [k, d];
  }
  return { known: false, ...(best ? { suggest: best } : {}) };
}

/** At most this many terms are counted again: one search each. */
export const TERMS = 8;
