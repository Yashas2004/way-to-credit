import { asc, eq, isNull } from "drizzle-orm";
import { banks } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export async function createBank(db: DbOrTx, name: string) {
  const [row] = await db.insert(banks).values({ name }).returning();
  if (!row) {
    throw new Error("Failed to create bank");
  }
  return row;
}

export async function listBanks(db: DbOrTx, includeDeleted: boolean) {
  const query = db.select().from(banks).orderBy(asc(banks.name));
  return includeDeleted ? query : query.where(isNull(banks.deletedAt));
}

export async function findBankById(db: DbOrTx, id: string) {
  const [row] = await db.select().from(banks).where(eq(banks.id, id)).limit(1);
  return row;
}

/** Locks the row — callers must be inside a `runLockedTransaction`. */
export async function findBankByIdForUpdate(db: DbOrTx, id: string) {
  const [row] = await db.select().from(banks).where(eq(banks.id, id)).for("update").limit(1);
  return row;
}

export async function updateBank(db: DbOrTx, id: string, name: string) {
  const [row] = await db.update(banks).set({ name }).where(eq(banks.id, id)).returning();
  return row;
}

export async function softDeleteBank(db: DbOrTx, id: string) {
  const [row] = await db
    .update(banks)
    .set({ deletedAt: new Date() })
    .where(eq(banks.id, id))
    .returning();
  return row;
}

export async function undeleteBank(db: DbOrTx, id: string) {
  const [row] = await db.update(banks).set({ deletedAt: null }).where(eq(banks.id, id)).returning();
  return row;
}
