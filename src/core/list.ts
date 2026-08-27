/** Reordering a list the user is looking at. Shared by the tools that show one. */

/** A copy of `list` with the item at `from` moved to `to`. Out-of-range is a no-op. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item!);
  return out;
}
