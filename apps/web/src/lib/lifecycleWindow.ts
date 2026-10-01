/**
 * The slice of a lifecycle shown around the current step: `before` steps
 * before it and `after` steps after it, so viewing step 8 of 50 shows steps
 * 6-11. At the ends the window slides rather than shrinking, so it always
 * shows `before + 1 + after` steps when there are that many: the first step
 * shows 1-6, the last shows 45-50. A lifecycle shorter than the window shows
 * every step.
 *
 * Indexes are 0-based; the result is [start, end), for `slice`.
 */
export function lifecycleWindow(
  total: number,
  current: number,
  before = 2,
  after = 3,
): { start: number; end: number } {
  const size = before + 1 + after;
  if (total <= size) return { start: 0, end: total };
  const start = Math.min(Math.max(current - before, 0), total - size);
  return { start, end: start + size };
}
