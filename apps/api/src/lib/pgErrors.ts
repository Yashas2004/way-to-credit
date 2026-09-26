// Postgres SQLSTATE for "unique_violation".
const UNIQUE_VIOLATION_SQLSTATE = "23505";
// Postgres SQLSTATE for "lock_not_available" (a `lock_timeout` hit).
const LOCK_TIMEOUT_SQLSTATE = "55P03";
// Postgres SQLSTATE for "query_canceled" — what a `statement_timeout` raises.
const QUERY_CANCELED_SQLSTATE = "57014";
// node-postgres gives these no code, only a message: pg-pool's acquisition
// timeout, and a new connection that didn't finish connecting in time.
const POOL_TIMEOUT_MESSAGES = [
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
];

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

/** The violated constraint's name (pg's `.constraint`), walking the same DrizzleQueryError cause chain as the SQLSTATE check. */
export function getViolatedConstraint(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("constraint" in error && typeof (error as { constraint?: unknown }).constraint === "string") {
    return (error as { constraint: string }).constraint;
  }
  if ("cause" in error) {
    return getViolatedConstraint((error as { cause?: unknown }).cause, depth + 1);
  }
  return undefined;
}

export function isUniqueViolationError(error: unknown): boolean {
  return getPgErrorCode(error) === UNIQUE_VIOLATION_SQLSTATE;
}

export function isLockTimeoutError(error: unknown): boolean {
  return getPgErrorCode(error) === LOCK_TIMEOUT_SQLSTATE;
}

function hasPoolTimeoutMessage(error: unknown, depth = 0): boolean {
  if (depth > 5 || !(error instanceof Error)) return false;
  if (POOL_TIMEOUT_MESSAGES.includes(error.message)) return true;
  return hasPoolTimeoutMessage(error.cause, depth + 1);
}

/**
 * The database is saturated rather than broken: no pool connection within
 * the acquisition timeout, or a statement cut off by statement_timeout.
 * Mapped to 503 SERVICE_BUSY by the error handler.
 */
export function isDatabaseBusyError(error: unknown): boolean {
  return getPgErrorCode(error) === QUERY_CANCELED_SQLSTATE || hasPoolTimeoutMessage(error);
}
