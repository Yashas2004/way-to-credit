// India Standard Time is a fixed UTC+05:30 offset with no daylight saving —
// this must never be derived from process.env.TZ or the host machine's local
// time zone, which is why every function here takes an explicit `now: Date`
// (an absolute instant) and does all wall-clock math via UTC getters on a
// millisecond-shifted copy of it, never the Date object's own local getters.
const IST_OFFSET_MINUTES = 5 * 60 + 30;

const WINDOW_START_MINUTES = 9 * 60; // 09:00 IST
const WINDOW_END_MINUTES = 18 * 60; // 18:00 IST

export const USER_ACCESS_WINDOW_DESCRIPTION = "Mon-Sat, 09:00-18:00 IST";

function toIstWallClock(now: Date): { dayOfWeek: number; minutesOfDay: number } {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    dayOfWeek: shifted.getUTCDay(), // 0 = Sunday, 6 = Saturday
    minutesOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Mon-Sat, 09:00-18:00 IST (18:00:00 itself is already outside the window). */
export function isWithinUserAccessWindow(now: Date): boolean {
  const { dayOfWeek, minutesOfDay } = toIstWallClock(now);

  if (dayOfWeek === 0) {
    return false;
  }

  return minutesOfDay >= WINDOW_START_MINUTES && minutesOfDay < WINDOW_END_MINUTES;
}
