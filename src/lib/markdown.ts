// Just enough Markdown for the release notes, which this repository writes itself: headings,
// bullets that wrap across lines, bold and code. A library would bring a parser for every
// construct we never emit; anything it does not know about is shown as the text it is.

export interface Inline {
  text: string;
  bold?: boolean;
  code?: boolean;
}

export type Block = { kind: "heading"; level: number; text: Inline[] } | { kind: "item"; text: Inline[] } | { kind: "paragraph"; text: Inline[] };

const MARK = /\*\*([^*]+)\*\*|`([^`]+)`/g;

/** Bold and code inside a line, with the rest left as it is. */
export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MARK.lastIndex = 0;
  while ((m = MARK.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1]) out.push({ text: m[1], bold: true });
    else out.push({ text: m[2], code: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}

export function markdown(source: string): Block[] {
  const blocks: Block[] = [];
  // a bullet or a paragraph continues while the following lines are neither blank nor new
  let open: { kind: "item" | "paragraph"; text: string } | null = null;
  const close = () => {
    if (open) blocks.push({ kind: open.kind, text: inline(open.text) });
    open = null;
  };

  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);

    if (!line.trim()) {
      close();
    } else if (heading) {
      close();
      blocks.push({ kind: "heading", level: heading[1].length, text: inline(heading[2]) });
    } else if (bullet) {
      close();
      open = { kind: "item", text: bullet[1] };
    } else if (open) {
      open.text += ` ${line.trim()}`;
    } else {
      open = { kind: "paragraph", text: line.trim() };
    }
  }
  close();
  return blocks;
}
