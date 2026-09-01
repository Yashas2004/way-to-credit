import { describe, expect, it } from "vitest";
import { isWithinUserAccessWindow } from "./time.js";

// Reference week: 2024-01-06 is a Saturday, 2024-01-07 a Sunday, 2024-01-08 a
// Monday. IST is UTC+05:30, so an IST wall-clock time of HH:MM is UTC
// (HH:MM - 05:30) on the same calendar day.

describe("isWithinUserAccessWindow", () => {
  it("allows Saturday 17:59 IST", () => {
    expect(isWithinUserAccessWindow(new Date(Date.UTC(2024, 0, 6, 12, 29, 0)))).toBe(true);
  });

  it("blocks Saturday 18:01 IST", () => {
    expect(isWithinUserAccessWindow(new Date(Date.UTC(2024, 0, 6, 12, 31, 0)))).toBe(false);
  });

  it("blocks Sunday entirely", () => {
    expect(isWithinUserAccessWindow(new Date(Date.UTC(2024, 0, 7, 6, 30, 0)))).toBe(false);
  });

  it("blocks Monday 08:59 IST", () => {
    expect(isWithinUserAccessWindow(new Date(Date.UTC(2024, 0, 8, 3, 29, 0)))).toBe(false);
  });

  it("allows Monday 09:00 IST", () => {
    expect(isWithinUserAccessWindow(new Date(Date.UTC(2024, 0, 8, 3, 30, 0)))).toBe(true);
  });

  it("blocks exactly 18:00:00 IST (the window closes at, not after, 18:00)", () => {
    expect(isWithinUserAccessWindow(new Date(Date.UTC(2024, 0, 6, 12, 30, 0)))).toBe(false);
  });
});
