import { describe, expect, it } from "vitest";
import { formatIstClock, getIstParts, isWarningWindow } from "./ist";

describe("getIstParts", () => {
  it("computes IST from a UTC epoch regardless of host timezone", () => {
    // 2024-01-08 06:30:00 UTC == 2024-01-08 12:00:00 IST (UTC+5:30) — the
    // exact instant already used as WITHIN_WINDOW_INSTANT on the backend.
    const date = new Date(Date.UTC(2024, 0, 8, 6, 30, 0));
    const parts = getIstParts(date);
    expect(parts.hours).toBe(12);
    expect(parts.minutes).toBe(0);
    expect(parts.seconds).toBe(0);
    expect(parts.dayOfWeek).toBe(1); // Monday
  });

  it("rolls over into the next IST calendar day near UTC midnight", () => {
    // 2024-01-08 19:00:00 UTC + 5:30 == 2024-01-09 00:30:00 IST.
    const date = new Date(Date.UTC(2024, 0, 8, 19, 0, 0));
    const parts = getIstParts(date);
    expect(parts.hours).toBe(0);
    expect(parts.minutes).toBe(30);
    expect(parts.dayOfWeek).toBe(2); // Tuesday now, in IST
  });
});

describe("isWarningWindow", () => {
  it("is true at exactly 17:30 IST", () => {
    // 17:30 IST == 12:00 UTC.
    const date = new Date(Date.UTC(2024, 0, 8, 12, 0, 0));
    expect(isWarningWindow(date)).toBe(true);
  });

  it("is false one minute before, at 17:29 IST", () => {
    const date = new Date(Date.UTC(2024, 0, 8, 11, 59, 0));
    expect(isWarningWindow(date)).toBe(false);
  });

  it("is true right up to, but false at, 18:00 IST", () => {
    const justBefore = new Date(Date.UTC(2024, 0, 8, 12, 29, 59));
    const exactlyCutoff = new Date(Date.UTC(2024, 0, 8, 12, 30, 0));
    expect(isWarningWindow(justBefore)).toBe(true);
    expect(isWarningWindow(exactlyCutoff)).toBe(false);
  });

  it("is false in the morning", () => {
    const date = new Date(Date.UTC(2024, 0, 8, 6, 30, 0)); // 12:00 IST
    expect(isWarningWindow(date)).toBe(false);
  });
});

describe("formatIstClock", () => {
  it("formats a full clock string with seconds and the IST suffix by default", () => {
    const date = new Date(Date.UTC(2024, 0, 8, 6, 30, 5)); // 12:00:05 IST
    expect(formatIstClock(date)).toBe("12:00:05 PM IST");
  });

  it("formats compactly without seconds or the suffix when requested", () => {
    const date = new Date(Date.UTC(2024, 0, 8, 6, 30, 5));
    expect(formatIstClock(date, { seconds: false, suffix: false })).toBe("12:00 PM");
  });

  it("uses 12-hour wraparound at midnight and noon", () => {
    const midnight = new Date(Date.UTC(2024, 0, 8, 18, 30, 0)); // 00:00 IST
    const noon = new Date(Date.UTC(2024, 0, 8, 6, 30, 0)); // 12:00 IST
    expect(formatIstClock(midnight, { seconds: false })).toBe("12:00 AM IST");
    expect(formatIstClock(noon, { seconds: false })).toBe("12:00 PM IST");
  });
});
