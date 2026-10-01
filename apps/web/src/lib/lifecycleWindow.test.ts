import { describe, expect, it } from "vitest";
import { lifecycleWindow } from "./lifecycleWindow";

// Steps are 1-based in the UI; the window works on 0-based indexes.
const steps = (total: number, step: number) => {
  const { start, end } = lifecycleWindow(total, step - 1);
  return Array.from({ length: end - start }, (_, i) => start + i + 1);
};

describe("lifecycleWindow", () => {
  it("shows two before and three after: step 8 of 50 shows 6-11", () => {
    expect(steps(50, 8)).toEqual([6, 7, 8, 9, 10, 11]);
  });

  it("slides at the start instead of shrinking: step 1 shows 1-6, step 2 shows 1-6", () => {
    expect(steps(50, 1)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps(50, 2)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps(50, 3)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps(50, 4)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("slides at the end: the last step shows the last six", () => {
    expect(steps(50, 50)).toEqual([45, 46, 47, 48, 49, 50]);
    expect(steps(50, 48)).toEqual([45, 46, 47, 48, 49, 50]);
    expect(steps(50, 47)).toEqual([45, 46, 47, 48, 49, 50]);
    expect(steps(50, 46)).toEqual([44, 45, 46, 47, 48, 49]);
  });

  it("shows every step when the lifecycle is no longer than the window", () => {
    expect(steps(6, 1)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps(6, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps(3, 2)).toEqual([1, 2, 3]);
    expect(steps(1, 1)).toEqual([1]);
  });

  it("is always the full six when there are at least six steps", () => {
    for (let total = 6; total <= 12; total++) {
      for (let step = 1; step <= total; step++) {
        const shown = steps(total, step);
        expect(shown).toHaveLength(6);
        expect(shown).toContain(step);
      }
    }
  });
});
