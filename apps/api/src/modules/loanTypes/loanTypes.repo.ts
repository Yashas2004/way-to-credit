import { asc, eq, isNull } from "drizzle-orm";
import { loanTypes } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export async function createLoanType(db: DbOrTx, name: string) {
  const [row] = await db.insert(loanTypes).values({ name }).returning();
  if (!row) {
    throw new Error("Failed to create loan type");
  }
  return row;
}

export async function listLoanTypes(db: DbOrTx, includeDeleted: boolean) {
  const query = db.select().from(loanTypes).orderBy(asc(loanTypes.name));
  return includeDeleted ? query : query.where(isNull(loanTypes.deletedAt));
}

export async function findLoanTypeById(db: DbOrTx, id: string) {
  const [row] = await db.select().from(loanTypes).where(eq(loanTypes.id, id)).limit(1);
  return row;
}

/** Locks the row — callers must be inside a `runLockedTransaction`. */
export async function findLoanTypeByIdForUpdate(db: DbOrTx, id: string) {
  const [row] = await db
    .select()
    .from(loanTypes)
    .where(eq(loanTypes.id, id))
    .for("update")
    .limit(1);
  return row;
}

export async function updateLoanType(db: DbOrTx, id: string, name: string) {
  const [row] = await db.update(loanTypes).set({ name }).where(eq(loanTypes.id, id)).returning();
  return row;
}

export async function softDeleteLoanType(db: DbOrTx, id: string) {
  const [row] = await db
    .update(loanTypes)
    .set({ deletedAt: new Date() })
    .where(eq(loanTypes.id, id))
    .returning();
  return row;
}

export async function undeleteLoanType(db: DbOrTx, id: string) {
  const [row] = await db
    .update(loanTypes)
    .set({ deletedAt: null })
    .where(eq(loanTypes.id, id))
    .returning();
  return row;
}
