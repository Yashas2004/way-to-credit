import { asc, eq, isNull } from "drizzle-orm";
import { statuses } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export interface CreateStatusInput {
  name: string;
  sortOrder: number;
}

export async function createStatus(db: DbOrTx, input: CreateStatusInput) {
  const [row] = await db.insert(statuses).values(input).returning();
  if (!row) {
    throw new Error("Failed to create status");
  }
  return row;
}

export async function listStatuses(db: DbOrTx, includeDeleted: boolean) {
  const query = db.select().from(statuses).orderBy(asc(statuses.sortOrder));
  return includeDeleted ? query : query.where(isNull(statuses.deletedAt));
}

export async function findStatusById(db: DbOrTx, id: string) {
  const [row] = await db.select().from(statuses).where(eq(statuses.id, id)).limit(1);
  return row;
}

/** Locks the row — callers must be inside a `runLockedTransaction`. */
export async function findStatusByIdForUpdate(db: DbOrTx, id: string) {
  const [row] = await db.select().from(statuses).where(eq(statuses.id, id)).for("update").limit(1);
  return row;
}

export interface UpdateStatusInput {
  name?: string;
  sortOrder?: number;
}

export async function updateStatus(db: DbOrTx, id: string, input: UpdateStatusInput) {
  const [row] = await db.update(statuses).set(input).where(eq(statuses.id, id)).returning();
  return row;
}

export async function softDeleteStatus(db: DbOrTx, id: string) {
  const [row] = await db
    .update(statuses)
    .set({ deletedAt: new Date() })
    .where(eq(statuses.id, id))
    .returning();
  return row;
}

export async function undeleteStatus(db: DbOrTx, id: string) {
  const [row] = await db
    .update(statuses)
    .set({ deletedAt: null })
    .where(eq(statuses.id, id))
    .returning();
  return row;
}
