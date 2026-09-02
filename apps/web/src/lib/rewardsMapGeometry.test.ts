import { describe, expect, it } from "vitest";
import {
  crackJitterForLevel,
  crackRotationForLevel,
  dripAttachmentPoint,
  dripPath,
  dripsForLevel,
  nextMilestoneIndex,
  progressFraction,
  waxEdgeSeedForLevel,
} from "./rewardsMapGeometry";

describe("per-level determinism", () => {
  it("returns the same wax-edge seed, crack jitter, and rotation on every call for a given level", () => {
    expect(waxEdgeSeedForLevel(3)).toBe(waxEdgeSeedForLevel(3));
    expect(crackJitterForLevel(3)).toEqual(crackJitterForLevel(3));
    expect(crackRotationForLevel(3)).toBe(crackRotationForLevel(3));
  });

  it("gives at least most levels 1-6 distinct seeds and jitter, not one template repeated", () => {
    const seeds = new Set([1, 2, 3, 4, 5, 6].map(waxEdgeSeedForLevel));
    expect(seeds.size).toBeGreaterThan(1);
    const jitters = new Set([1, 2, 3, 4, 5, 6].map((l) => JSON.stringify(crackJitterForLevel(l))));
    expect(jitters.size).toBeGreaterThan(1);
  });
});

describe("dripsForLevel", () => {
  it("returns the same 2-3 drips on every call for a given level, not randomized", () => {
    const first = dripsForLevel(4);
    const second = dripsForLevel(4);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(first.length).toBeLessThanOrEqual(3);
  });

  it("varies the drip count or angles across levels 1-6, not one template repeated", () => {
    const sets = [1, 2, 3, 4, 5, 6].map((l) => JSON.stringify(dripsForLevel(l)));
    expect(new Set(sets).size).toBeGreaterThan(1);
  });

  it("keeps every drip in the lower hemisphere (never above the horizontal midline) but spreads them well past the bottom center, including toward the sides", () => {
    let sawPastForty = false;
    for (const level of [1, 2, 3, 4, 5, 6]) {
      for (const drip of dripsForLevel(level)) {
        expect(Math.abs(drip.angleDeg)).toBeLessThanOrEqual(90);
        if (Math.abs(drip.angleDeg) > 40) sawPastForty = true;
      }
    }
    // At least some drips genuinely reach toward the sides, not just a
    // slightly wider cluster around the bottom center.
    expect(sawPastForty).toBe(true);
  });
});

describe("dripAttachmentPoint", () => {
  it("sits at the rim's bottom-most point when angleDeg is 0", () => {
    const point = dripAttachmentPoint(40, { angleDeg: 0, length: 5, width: 2 });
    expect(point.x).toBeCloseTo(0, 5);
    expect(point.y).toBeCloseTo(40, 5);
  });

  it("leans toward -x for a negative angle and +x for a positive one", () => {
    const left = dripAttachmentPoint(40, { angleDeg: -20, length: 5, width: 2 });
    const right = dripAttachmentPoint(40, { angleDeg: 20, length: 5, width: 2 });
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
  });
});

describe("dripPath", () => {
  it("starts and ends the path at the rim (y=0) and reaches down to y=length", () => {
    const d = dripPath(4, 8);
    expect(d).toContain(",0 C");
    expect(d).toContain(" 0,8 C");
  });
});

describe("nextMilestoneIndex", () => {
  const thresholds = [5, 10, 15, 20, 25, 30];

  it("returns the first not-yet-reached milestone", () => {
    expect(nextMilestoneIndex(thresholds, 0)).toBe(0);
    expect(nextMilestoneIndex(thresholds, 5)).toBe(1); // 5 already reached level 1
    expect(nextMilestoneIndex(thresholds, 17)).toBe(3); // levels 1-3 reached, level 4 (20) is next
  });

  it("returns -1 once every milestone is reached", () => {
    expect(nextMilestoneIndex(thresholds, 30)).toBe(-1);
    expect(nextMilestoneIndex(thresholds, 500)).toBe(-1);
  });
});

describe("progressFraction", () => {
  const thresholds = [5, 10, 15, 20, 25, 30];

  it("is 0 at the start of a segment and 1 once its threshold is reached", () => {
    expect(progressFraction(thresholds, 0, 0)).toBe(0);
    expect(progressFraction(thresholds, 0, 5)).toBe(1);
  });

  it("computes a fraction relative to the previous threshold, not zero", () => {
    // Level 4 spans 15 (level 3) to 20 — 17 is 40% of the way.
    expect(progressFraction(thresholds, 3, 17)).toBeCloseTo(0.4, 5);
  });

  it("clamps to [0, 1]", () => {
    expect(progressFraction(thresholds, 3, 1000)).toBe(1);
    expect(progressFraction(thresholds, 3, 0)).toBe(0);
  });
});
