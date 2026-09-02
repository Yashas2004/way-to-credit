import { env } from "../config/env.js";

/**
 * The real clock everywhere, except when a developer has explicitly set
 * FAKE_NOW while running with NODE_ENV=development (see config/env.ts and
 * index.ts's boot-time warning). Used only as the *default* for a `now`
 * parameter — every call site that needs to inject a specific instant
 * (tests, most notably `auth.test.ts`'s "time window enforcement in the
 * service layer" suite) still does so by passing `now` explicitly, which
 * always wins over this default.
 *
 * No access-control logic changes here — `isWithinUserAccessWindow` (in
 * `lib/time.ts`) is untouched and always runs its real, unmodified check.
 * This only ever changes which `now` instant that check is evaluated
 * against, and only in that one narrow, gated, dev-only case.
 */
export function currentInstant(): Date {
  if (env.NODE_ENV === "development" && env.FAKE_NOW) {
    return new Date(env.FAKE_NOW);
  }
  return new Date();
}
