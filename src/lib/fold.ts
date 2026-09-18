// Folding pretty-printed JSON, without turning it into a tree. The inspector renders the text
// of a row — coloured, searchable, selectable — and a tree would have to give all three up to
// gain a chevron. So the chevron is put on the text instead: a line that opens a block knows
// which line closes it, and the lines between can be left out.

/** For each line that opens a block, the line that closes it. Lines are zero-based. */
export function blocksOf(text: string): Map<number, number> {
  const blocks = new Map<number, number>();
  const open: number[] = [];
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    let inString = false;
    let escaped = false;
    for (const ch of line) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = inString;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{" || ch === "[") open.push(i);
      else if (ch === "}" || ch === "]") {
        const from = open.pop();
        // a block worth folding is one that is not already on a single line
        if (from !== undefined && from < i) blocks.set(from, i);
      }
    }
  });
  return blocks;
}

/**
 * Which lines are on screen, given the blocks that are folded. A fold inside a fold is
 * hidden by the outer one, and stays folded when it comes back.
 */
export function visibleLines(total: number, blocks: Map<number, number>, folded: Set<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < total; i++) {
    out.push(i);
    if (folded.has(i)) {
      const end = blocks.get(i);
      if (end !== undefined) i = end; // the closing line goes with what it closed
    }
  }
  return out;
}

/** The fold hiding a line, if one is: what to open so a match can be reached. */
export function foldAround(line: number, blocks: Map<number, number>, folded: Set<number>): number | null {
  for (const start of folded) {
    const end = blocks.get(start);
    if (end !== undefined && line > start && line <= end) return start;
  }
  return null;
}
