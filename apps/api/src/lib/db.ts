import pg from "pg";
import { env } from "../config/env.js";

/**
 * Timeouts, so a saturated pool or a runaway query fails fast and visibly
 * (a 503 SERVICE_BUSY, see middleware/errorHandler.ts) instead of stalling
 * silently. Measured before these existed: during a cache-rebuild storm a
 * one-row query waited 5.1 s for a connection, and node-postgres's default
 * acquisition wait is unbounded.
 *
 * - Acquisition (client-side, works with any pooler): 3 s. A healthy pool
 *   hands out a connection in well under a millisecond.
 * - statement_timeout 5 s: the slowest real query measured at a year's data
 *   was 131 ms (now indexed). lock_timeout (3 s, lockedTransaction.ts) stays
 *   below it, so a lock wait still surfaces as 409 RESOURCE_BUSY.
 * - idle_in_transaction_session_timeout 10 s: a leaked transaction can't
 *   hold row locks indefinitely.
 *
 * The two server-side settings are applied with SET on each new physical
 * connection rather than as startup parameters, which transaction-mode
 * poolers (PgBouncer and friends) reject — that would stop the app
 * connecting at all in production. Behind such a pooler a session SET isn't
 * guaranteed to stick, so production also sets both on the database role
 * (CLAUDE.md deployment checklist); index.ts warns at boot if the effective
 * statement_timeout is 0.
 */
export const POOL_ACQUIRE_TIMEOUT_MS = 3_000;
export const STATEMENT_TIMEOUT_MS = 5_000;
export const IDLE_IN_TRANSACTION_TIMEOUT_MS = 10_000;

export function createPool(overrides: pg.PoolConfig = {}): pg.Pool {
  const created = new pg.Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: POOL_ACQUIRE_TIMEOUT_MS,
    ...overrides,
  });
  created.on("connect", (client) => {
    client
      .query(
        `SET statement_timeout = ${String(STATEMENT_TIMEOUT_MS)}; ` +
          `SET idle_in_transaction_session_timeout = ${String(IDLE_IN_TRANSACTION_TIMEOUT_MS)}`,
      )
      .catch(() => {
        // Surfaces on the checkout's own query anyway; nothing useful to add here.
      });
  });
  return created;
}

export const pool = createPool();

/** The effective statement_timeout, in ms (0 = none). */
export async function effectiveStatementTimeoutMs(): Promise<number> {
  const result = await pool.query<{ ms: string }>(
    "SELECT setting AS ms FROM pg_settings WHERE name = 'statement_timeout'",
  );
  return Number(result.rows[0]?.ms ?? 0);
}

export async function pingDb(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
