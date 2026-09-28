/**
 * Flattens keyset pages into one list, keeping the first (newest)
 * occurrence of each id. Help-request lists page by last activity, which
 * only ever moves forward, so a request can't legitimately appear on two
 * pages of one pass — this is defence in depth against a future change
 * breaking that, so a duplicate can never render as two rows.
 */
export function dedupeById<T extends { id: string }>(
  pages: readonly { items: readonly T[] }[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
