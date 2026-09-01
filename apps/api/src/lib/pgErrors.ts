// Postgres SQLSTATE for "unique_violation".
const UNIQUE_VIOLATION_SQLSTATE = "23505";
// Postgres SQLSTATE for "lock_not_available" (a `lock_timeout` hit).
const LOCK_TIMEOUT_SQLSTATE = "55P03";

/**
 * drizzle-orm's node-postgres driver wraps the real `pg` error in a
 * `DrizzleQueryError`, with the original error (and its `.code` SQLSTATE)
 * attached as `.cause`, not present on the top-level thrown error — so
 * every SQLSTATE check has to walk the cause chain, not just check
 * `error.code` directly.
 */
function getPgErrorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  if ("cause" in error) {
    return getPgErrorCode((error as { cause?: unknown }).cause, depth + 1);
  }
  return undefined;
}

export function isUniqueViolationError(error: unknown): boolean {
  return getPgErrorCode(error) === UNIQUE_VIOLATION_SQLSTATE;
}

export function isLockTimeoutError(error: unknown): boolean {
  return getPgErrorCode(error) === LOCK_TIMEOUT_SQLSTATE;
}
