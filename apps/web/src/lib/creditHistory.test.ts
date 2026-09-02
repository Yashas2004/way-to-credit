import type { CreditHistoryEntry } from "@way-to-credit/shared";
import { describe, expect, it } from "vitest";
import { queriesContributingToMilestone } from "./creditHistory";

function entry(overrides: Partial<CreditHistoryEntry>): CreditHistoryEntry {
  return {
    id: crypto.randomUUID(),
    delta: 1,
    reason: "Query approved",
    createdAt: new Date().toISOString(),
    queryId: crypto.randomUUID(),
    bankNameSnapshot: "Bank",
    loanTypeNameSnapshot: "Loan",
    statusNameSnapshot: "Status",
    ...overrides,
  };
}

describe("queriesContributingToMilestone", () => {
  it("picks the exact entries whose running total crosses into the milestone's range, oldest first", () => {
    // Oldest -> newest: +1 (total 1), +1 (2), +1 (3), +1 (4), +1 (5). Level 1 is 0..5.
    const chronological = [1, 2, 3, 4, 5].map((n) => entry({ id: `q${String(n)}` }));
    const newestFirst = [...chronological].reverse();

    const result = queriesContributingToMilestone(newestFirst, 0, 5);
    expect(result.map((e) => e.id)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
  });

  it("excludes entries outside the (previous, threshold] range", () => {
    // total after each: 1..10. Level 2 is (5, 10].
    const chronological = Array.from({ length: 10 }, (_, i) => entry({ id: `q${String(i + 1)}` }));
    const newestFirst = [...chronological].reverse();

    const result = queriesContributingToMilestone(newestFirst, 5, 10);
    expect(result.map((e) => e.id)).toEqual(["q6", "q7", "q8", "q9", "q10"]);
  });

  it("excludes manual adjustments (queryId null) even if they fall in range", () => {
    const chronological = [
      entry({ id: "q1", delta: 3 }), // total 3
      entry({ id: "adjustment", delta: 1, queryId: null }), // total 4
      entry({ id: "q2", delta: 1 }), // total 5
    ];
    const newestFirst = [...chronological].reverse();

    const result = queriesContributingToMilestone(newestFirst, 0, 5);
    expect(result.map((e) => e.id)).toEqual(["q1", "q2"]);
  });

  it("returns an empty array when nothing falls in range", () => {
    const newestFirst = [entry({ id: "q1", delta: 1 })];
    expect(queriesContributingToMilestone(newestFirst, 10, 15)).toEqual([]);
  });
});
