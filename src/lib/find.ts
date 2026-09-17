// Finding text in the value inspector, and getting it onto the screen without losing the
// syntax colours it already has. Both halves are here because both are decisions with edge
// cases: what counts as a match, and what happens when a match and a token disagree about
// where they end.

export interface Match {
  start: number;
  end: number;
}

/** Every occurrence, case-insensitively, as offsets into the whole text. */
export function findAll(text: string, query: string): Match[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const hay = text.toLowerCase();
  const out: Match[] = [];
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
    out.push({ start: at, end: at + needle.length });
  }
  return out;
}

export interface Span {
  text: string;
  color?: string;
  /** The index of the match this span belongs to, when it is inside one. */
  match?: number;
}

/**
 * One line's spans, cut at every boundary either side cares about. A match that straddles
 * two tokens is split across them rather than dropped, which is the case a naive "highlight
 * inside each token" gets wrong.
 */
export function withMatches(tokens: Span[], lineStart: number, matches: Match[]): Span[] {
  if (!matches.length) return tokens;
  const out: Span[] = [];
  let at = lineStart;
  for (const token of tokens) {
    let cut = 0;
    while (cut < token.text.length) {
      const here = at + cut;
      const index = matches.findIndex((m) => m.start <= here && here < m.end);
      const inside = index !== -1;
      // up to the end of this match, or up to the start of the next one
      const stop = inside
        ? Math.min(token.text.length, matches[index].end - at)
        : Math.min(token.text.length, ...matches.filter((m) => m.start > here).map((m) => m.start - at));
      out.push({ text: token.text.slice(cut, stop), color: token.color, match: inside ? index : undefined });
      cut = stop;
    }
    at += token.text.length;
  }
  return out;
}

/** Each line with where it starts in the whole text, newlines included in the count. */
export function lines(text: string): { line: string; start: number }[] {
  let at = 0;
  return text.split("\n").map((line) => {
    const start = at;
    at += line.length + 1; // the newline the split ate
    return { line, start };
  });
}
