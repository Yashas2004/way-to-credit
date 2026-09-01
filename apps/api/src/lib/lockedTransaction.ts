import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import type { DbOrTx } from "../db/types.js";
import { ResourceBusyError } from "./errors.js";
import { isLockTimeoutError } from "./pgErrors.js";

/**
 * Runs `fn` inside a transaction with `lock_timeout` set to 3s (CLAUDE.md
 * invariant #18) — required for any transaction that takes a
 * `SELECT ... FOR UPDATE` row lock. A stuck lock holder times out instead of
 * blocking the request and holding a pool connection indefinitely; the
 * resulting Postgres error is mapped to `ResourceBusyError` (409) rather
 * than leaking a raw driver error.
 */
export async function runLockedTransaction<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
      return fn(tx);
    });
  } catch (error) {
    if (isLockTimeoutError(error)) {
      throw new ResourceBusyError(
        "This record is currently being modified by another request. Please try again.",
      );
    }
    throw error;
  }
}
