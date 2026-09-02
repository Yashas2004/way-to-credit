/**
 * Fixed UTC+05:30 IST arithmetic — mirrors the backend's `lib/time.ts`.
 * Every function here takes a `Date` explicitly and never reads
 * `Date.now()` or the host's local timezone internally, so behavior is
 * identical regardless of what machine/browser timezone this runs in
 * (and trivially testable by constructing a UTC epoch directly).
 */

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const WARNING_START_MINUTES = 17 * 60 + 30; // 17:30 IST
const CUTOFF_MINUTES = 18 * 60; // 18:00 IST

export interface IstParts {
  hours: number; // 0-23
  minutes: number;
  seconds: number;
  dayOfWeek: number; // 0 = Sunday
}

function toIstShifted(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
}

/** IST wall-clock components, read via UTC getters on a shifted copy — never the local timezone. */
export function getIstParts(date: Date): IstParts {
  const shifted = toIstShifted(date);
  return {
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
    dayOfWeek: shifted.getUTCDay(),
  };
}

/** True from 17:30 IST up to (not including) 18:00 IST. */
export function isWarningWindow(date: Date): boolean {
  const { hours, minutes } = getIstParts(date);
  const minutesOfDay = hours * 60 + minutes;
  return minutesOfDay >= WARNING_START_MINUTES && minutesOfDay < CUTOFF_MINUTES;
}

/**
 * Converts an IST calendar date ("2026-09-02") to the UTC instant range
 * covering that whole IST day — for admin date-range filters, where a
 * picked date means "that day in IST", not "that day in UTC". The literal
 * `+05:30` offset in the ISO string lets `Date` do the conversion; no
 * manual offset arithmetic needed.
 */
export function istDayRangeUtc(dateStr: string): { fromUtc: string; toUtc: string } {
  const start = new Date(`${dateStr}T00:00:00.000+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60_000 - 1);
  return { fromUtc: start.toISOString(), toUtc: end.toISOString() };
}

/** "2026-09-02" in IST — used to name the knowledge-base export file so a same-day re-export overwrites rather than colliding on a UTC-date filename. */
export function formatIstDateStamp(date: Date): string {
  const shifted = toIstShifted(date);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${String(year)}-${month}-${day}`;
}

export interface FormatIstClockOptions {
  /** @default true */
  seconds?: boolean;
  /** @default true */
  suffix?: boolean;
}

export function formatIstClock(date: Date, options: FormatIstClockOptions = {}): string {
  const { hours, minutes, seconds } = getIstParts(date);
  const showSeconds = options.seconds ?? true;
  const showSuffix = options.suffix ?? true;

  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  const time = showSeconds ? `${String(hour12)}:${mm}:${ss}` : `${String(hour12)}:${mm}`;
  return showSuffix ? `${time} ${period} IST` : `${time} ${period}`;
}
