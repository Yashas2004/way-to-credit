import { and, asc, eq, isNull } from "drizzle-orm";
import { bankLoanTypes, loanTypes } from "../../db/schema/index.js";
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

/** Active loan types currently attached to a bank — for the knowledge base's own bank→loan-type cascade and the catalog drawer's attach/detach state. */
export async function listLoanTypesForBank(db: DbOrTx, bankId: string) {
  return db
    .select({
      id: loanTypes.id,
      name: loanTypes.name,
      deletedAt: loanTypes.deletedAt,
      createdAt: loanTypes.createdAt,
      updatedAt: loanTypes.updatedAt,
    })
    .from(bankLoanTypes)
    .innerJoin(loanTypes, eq(bankLoanTypes.loanTypeId, loanTypes.id))
    .where(and(eq(bankLoanTypes.bankId, bankId), isNull(loanTypes.deletedAt)))
    .orderBy(asc(loanTypes.name));
}
