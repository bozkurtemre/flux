// Where a dragged column lands. The one piece of the grid's column handling worth pinning
// down: the dragged column takes the target's place, which is where the drop line is drawn.

export function moveColumn(columns: string[], moved: string, onto: string): string[] {
  const rest = columns.filter((c) => c !== moved);
  const at = rest.indexOf(onto);
  if (at === -1) return columns;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}
