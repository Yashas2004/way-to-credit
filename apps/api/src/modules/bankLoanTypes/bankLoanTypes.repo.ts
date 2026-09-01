import { and, eq } from "drizzle-orm";
import { bankLoanTypes } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export async function findPair(db: DbOrTx, bankId: string, loanTypeId: string) {
  const [row] = await db
    .select()
    .from(bankLoanTypes)
    .where(and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, loanTypeId)))
    .limit(1);
  return row;
}

/** Locks the row — callers must be inside a `runLockedTransaction`. */
export async function findPairForUpdate(db: DbOrTx, bankId: string, loanTypeId: string) {
  const [row] = await db
    .select()
    .from(bankLoanTypes)
    .where(and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, loanTypeId)))
    .for("update")
    .limit(1);
  return row;
}

export async function insertPair(db: DbOrTx, bankId: string, loanTypeId: string) {
  const [row] = await db.insert(bankLoanTypes).values({ bankId, loanTypeId }).returning();
  if (!row) {
    throw new Error("Failed to attach loan type to bank");
  }
  return row;
}

export async function deletePair(db: DbOrTx, bankId: string, loanTypeId: string): Promise<void> {
  await db
    .delete(bankLoanTypes)
    .where(and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, loanTypeId)));
}
