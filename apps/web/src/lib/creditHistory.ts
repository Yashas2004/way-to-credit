import type { CreditHistoryEntry } from "@way-to-credit/shared";

/**
 * Which of this user's query-linked credit entries pushed their running
 * total from `previousThreshold` up through `threshold` — i.e. "the
 * approved queries that contributed the points for this milestone."
 * Milestones don't own a foreign key to specific ledger rows; this
 * recovers the association by replaying the ledger in chronological order
 * and watching the running total cross the range.
 *
 * `entriesNewestFirst` is exactly what `GET /me/credits/history` returns.
 * Manual admin adjustments (queryId null) count toward the running total
 * but are excluded from the result — the brief asks for "the approved
 * queries," not the ledger generally.
 *
 * Known, accepted limitation: this only sees whatever page(s) of history
 * were fetched. For this app's realistic scale (30 points across 6 levels,
 * each level 5 query approvals) a single ~100-row fetch covers the whole
 * ledger; a user with an unusually long manual-adjustment history could in
 * principle have earlier rows missing from the running-total computation,
 * which would only affect this detail view, never the actual credit total
 * or milestone unlocking (both computed server-side, unaffected by this).
 */
export function queriesContributingToMilestone(
  entriesNewestFirst: readonly CreditHistoryEntry[],
  previousThreshold: number,
  threshold: number,
): CreditHistoryEntry[] {
  const chronological = [...entriesNewestFirst].reverse();
  const result: CreditHistoryEntry[] = [];
  let runningTotal = 0;

  for (const entry of chronological) {
    runningTotal += entry.delta;
    if (runningTotal > previousThreshold && runningTotal <= threshold && entry.queryId) {
      result.push(entry);
    }
  }

  return result;
}
