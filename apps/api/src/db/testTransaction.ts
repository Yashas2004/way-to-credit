import { db } from "./client.js";
import type { DbOrTx } from "./types.js";

class RollbackTestTransaction extends Error {}

const ROLLBACK = new RollbackTestTransaction("test-transaction-rollback");

/**
 * Runs `fn` inside a real Postgres transaction and always rolls it back
 * afterward, regardless of whether `fn` throws — so tests can exercise real
 * constraint violations without leaving any rows behind.
 */
export async function withRolledBackTransaction(fn: (tx: DbOrTx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) {
      throw error;
    }
  }
}
