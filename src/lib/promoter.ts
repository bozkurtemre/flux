// The IDE's key promoter: something done with the mouse three times, when it has a shortcut,
// earns one tip naming the keys. Every button with a shortcut already says so in `data-tip-key`,
// so the clicks are counted by that, and a shortcut once told is never told again.

export const TIP_AFTER = 3;

/** Counts a click on a shortcut; true on the click that earns the tip. */
export function promoter(told: Iterable<string>) {
  const done = new Set(told);
  const clicks = new Map<string, number>();
  return (keys: string): boolean => {
    if (done.has(keys)) return false;
    const n = (clicks.get(keys) ?? 0) + 1;
    clicks.set(keys, n);
    if (n < TIP_AFTER) return false;
    done.add(keys);
    return true;
  };
}
