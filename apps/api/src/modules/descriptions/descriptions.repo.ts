import { and, eq, sql, type SQL } from "drizzle-orm";
import { bankLoanTypes, descriptions, statuses } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

async function countWhere(db: DbOrTx, condition: SQL | undefined): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)`.mapWith(Number) })
    .from(descriptions)
    .where(condition);
  return row?.value ?? 0;
}

export function countDescriptionsForBank(db: DbOrTx, bankId: string): Promise<number> {
  return countWhere(db, eq(descriptions.bankId, bankId));
}

export function countDescriptionsForLoanType(db: DbOrTx, loanTypeId: string): Promise<number> {
  return countWhere(db, eq(descriptions.loanTypeId, loanTypeId));
}

export function countDescriptionsForStatus(db: DbOrTx, statusId: string): Promise<number> {
  return countWhere(db, eq(descriptions.statusId, statusId));
}

export function countDescriptionsForPair(
  db: DbOrTx,
  bankId: string,
  loanTypeId: string,
): Promise<number> {
  return countWhere(
    db,
    and(eq(descriptions.bankId, bankId), eq(descriptions.loanTypeId, loanTypeId)),
  );
}

export async function findDescriptionByTriple(
  db: DbOrTx,
  bankId: string,
  loanTypeId: string,
  statusId: string,
) {
  const [row] = await db
    .select()
    .from(descriptions)
    .where(
      and(
        eq(descriptions.bankId, bankId),
        eq(descriptions.loanTypeId, loanTypeId),
        eq(descriptions.statusId, statusId),
      ),
    )
    .limit(1);
  return row;
}

export interface UpsertDescriptionInput {
  bankId: string;
  loanTypeId: string;
  statusId: string;
  body: string;
  updatedBy: string;
}

export async function upsertDescription(db: DbOrTx, input: UpsertDescriptionInput) {
  const [row] = await db
    .insert(descriptions)
    .values(input)
    .onConflictDoUpdate({
      target: [descriptions.bankId, descriptions.loanTypeId, descriptions.statusId],
      set: { body: input.body, updatedBy: input.updatedBy, updatedAt: new Date() },
    })
    .returning();

  if (!row) {
    throw new Error("Failed to upsert description");
  }
  return row;
}

export async function findBankLoanTypePair(db: DbOrTx, bankId: string, loanTypeId: string) {
  const [row] = await db
    .select()
    .from(bankLoanTypes)
    .where(and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, loanTypeId)))
    .limit(1);
  return row;
}

/**
 * Locks the pairing row if it exists — part of the fixed lock order
 * (banks, loanTypes, statuses, bank_loan_types) the description-upsert path
 * takes, so it can't race a concurrent `detach` the way plain
 * check-then-write would. A no-op (no row to lock) if the pair isn't wired;
 * callers must be inside a `runLockedTransaction`.
 */
export async function findBankLoanTypePairForUpdate(
  db: DbOrTx,
  bankId: string,
  loanTypeId: string,
) {
  const [row] = await db
    .select()
    .from(bankLoanTypes)
    .where(and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, loanTypeId)))
    .for("update")
    .limit(1);
  return row;
}

/** Every active status, LEFT JOINed to this pair's descriptions — the admin curation grid. */
export async function listDescriptionGridForPair(db: DbOrTx, bankId: string, loanTypeId: string) {
  return db
    .select({
      statusId: statuses.id,
      statusName: statuses.name,
      sortOrder: statuses.sortOrder,
      body: descriptions.body,
      updatedAt: descriptions.updatedAt,
      updatedBy: descriptions.updatedBy,
    })
    .from(statuses)
    .leftJoin(
      descriptions,
      and(
        eq(descriptions.statusId, statuses.id),
        eq(descriptions.bankId, bankId),
        eq(descriptions.loanTypeId, loanTypeId),
      ),
    )
    .where(sql`${statuses.deletedAt} IS NULL`)
    .orderBy(statuses.sortOrder);
}
