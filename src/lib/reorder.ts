// Moving one item of a list in front of another. Shared by the two places that can be
// dragged into a different order: the result grid's columns and the editor's tabs.

export function moveBefore(items: string[], moved: string, onto: string): string[] {
  const rest = items.filter((item) => item !== moved);
  const at = rest.indexOf(onto);
  if (at === -1) return items;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}
