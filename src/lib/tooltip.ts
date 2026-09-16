// Where a tooltip goes. The one decision worth keeping out of the component: below the
// thing it describes, unless the window has no room, and never off the edge.

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MARGIN = 6;

export function placeTooltip(anchor: Box, tip: { width: number; height: number }, view: { width: number; height: number }, gap = 6) {
  const below = anchor.top + anchor.height + gap;
  const above = anchor.top - tip.height - gap;
  // flipping only helps if there is actually room up there
  const top = below + tip.height + MARGIN > view.height && above >= MARGIN ? above : below;
  const centred = anchor.left + anchor.width / 2 - tip.width / 2;
  const left = Math.max(MARGIN, Math.min(centred, view.width - tip.width - MARGIN));
  return { left, top };
}
