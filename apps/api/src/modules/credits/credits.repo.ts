import { and, asc, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  creditTransactions,
  milestones,
  queries,
  userMilestones,
  users,
} from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export async function findUserCreditPoints(
  db: DbOrTx,
  userId: string,
): Promise<number | undefined> {
  const [row] = await db
    .select({ creditPoints: users.creditPoints })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.creditPoints;
}

type UserRow = typeof users.$inferSelect;

/** Locks the row — callers must be inside a `runLockedTransaction`. */
export async function findUserByIdForUpdate(db: DbOrTx, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).for("update").limit(1);
  return row;
}

export interface InsertCreditTransactionInput {
  userId: string;
  delta: number;
  reason: string;
  queryId: string | null;
}

export async function insertCreditTransaction(db: DbOrTx, input: InsertCreditTransactionInput) {
  const [row] = await db.insert(creditTransactions).values(input).returning();
  if (!row) {
    throw new Error("Failed to insert credit transaction");
  }
  return row;
}

/** Relative, atomic — safe to call while already holding a `FOR UPDATE` lock on this row. */
export async function incrementUserCreditPoints(
  db: DbOrTx,
  userId: string,
  delta: number,
): Promise<UserRow> {
  const [row] = await db
    .update(users)
    .set({ creditPoints: sql`${users.creditPoints} + ${delta}` })
    .where(eq(users.id, userId))
    .returning();
  if (!row) {
    throw new Error("Failed to update user credit points");
  }
  return row;
}

type MilestoneRow = typeof milestones.$inferSelect;
type UserMilestoneRow = typeof userMilestones.$inferSelect;

/**
 * Computes newly-crossed milestones and inserts them, `ON CONFLICT (user_id,
 * milestone_id) DO NOTHING`. Not itself concurrency-guarded beyond the
 * caller's `FOR UPDATE` on the user row — see the stage plan's decision on
 * the milestone-eligibility TOCTOU window (accepted, self-healing on the
 * user's next credit event, not mitigated further here).
 */
export async function unlockEligibleMilestones(
  db: DbOrTx,
  userId: string,
  newTotal: number,
): Promise<MilestoneRow[]> {
  const eligible = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.isActive, true), lte(milestones.pointsRequired, newTotal)));

  if (eligible.length === 0) {
    return [];
  }

  const alreadyUnlocked = await db
    .select({ milestoneId: userMilestones.milestoneId })
    .from(userMilestones)
    .where(
      and(
        eq(userMilestones.userId, userId),
        inArray(
          userMilestones.milestoneId,
          eligible.map((m) => m.id),
        ),
      ),
    );
  const alreadyUnlockedIds = new Set(alreadyUnlocked.map((r) => r.milestoneId));

  const toInsert = eligible.filter((m) => !alreadyUnlockedIds.has(m.id));
  if (toInsert.length === 0) {
    return [];
  }

  const inserted = await db
    .insert(userMilestones)
    .values(toInsert.map((m) => ({ userId, milestoneId: m.id })))
    .onConflictDoNothing()
    .returning({ milestoneId: userMilestones.milestoneId });

  const insertedIds = new Set(inserted.map((r) => r.milestoneId));
  return toInsert.filter((m) => insertedIds.has(m.id));
}

export async function findUserMilestoneRow(
  db: DbOrTx,
  userId: string,
  milestoneId: string,
): Promise<UserMilestoneRow | undefined> {
  const [row] = await db
    .select()
    .from(userMilestones)
    .where(and(eq(userMilestones.userId, userId), eq(userMilestones.milestoneId, milestoneId)))
    .limit(1);
  return row;
}

/** Guarded, idempotent — a second call matches zero rows and is a no-op. */
export async function markUserMilestoneSeen(
  db: DbOrTx,
  userId: string,
  milestoneId: string,
): Promise<void> {
  await db
    .update(userMilestones)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(userMilestones.userId, userId),
        eq(userMilestones.milestoneId, milestoneId),
        isNull(userMilestones.seenAt),
      ),
    );
}

export interface UnlockedMilestoneRow {
  milestoneId: string;
  levelNumber: number;
  pointsRequired: number;
  title: string;
  message: string;
  unlockedAt: Date;
}

/**
 * Live join, no `isActive` filter — see stage decision #10.
 * `userMilestones` has no title/message snapshot columns (unlike
 * `queries`), so this necessarily reflects current milestone copy; and a
 * later admin deactivation shouldn't erase a user's already-earned unlock
 * from their own history.
 */
export async function listUnlockedMilestonesForUser(
  db: DbOrTx,
  userId: string,
): Promise<UnlockedMilestoneRow[]> {
  return db
    .select({
      milestoneId: milestones.id,
      levelNumber: milestones.levelNumber,
      pointsRequired: milestones.pointsRequired,
      title: milestones.title,
      message: milestones.message,
      unlockedAt: userMilestones.unlockedAt,
    })
    .from(userMilestones)
    .innerJoin(milestones, eq(userMilestones.milestoneId, milestones.id))
    .where(eq(userMilestones.userId, userId))
    .orderBy(milestones.levelNumber);
}

export interface RewardsMapMilestoneRow {
  milestoneId: string;
  levelNumber: number;
  pointsRequired: number;
  title: string;
  message: string;
  unlockedAt: Date | null;
  seenAt: Date | null;
}

/**
 * Every active milestone (locked or unlocked) for the rewards map, left-joined
 * against this user's own `user_milestones` row so a locked milestone comes
 * back with `unlockedAt`/`seenAt` both null rather than being omitted.
 * `isActive` IS filtered here — unlike `listUnlockedMilestonesForUser`,
 * which deliberately ignores it to preserve history (see that function's
 * comment), the rewards map is a forward-looking view of the current active
 * set, not a historical record.
 */
export async function listAllMilestonesForUser(
  db: DbOrTx,
  userId: string,
): Promise<RewardsMapMilestoneRow[]> {
  return db
    .select({
      milestoneId: milestones.id,
      levelNumber: milestones.levelNumber,
      pointsRequired: milestones.pointsRequired,
      title: milestones.title,
      message: milestones.message,
      unlockedAt: userMilestones.unlockedAt,
      seenAt: userMilestones.seenAt,
    })
    .from(milestones)
    .leftJoin(
      userMilestones,
      and(eq(userMilestones.milestoneId, milestones.id), eq(userMilestones.userId, userId)),
    )
    .where(eq(milestones.isActive, true))
    .orderBy(asc(milestones.levelNumber));
}

export interface CreditHistoryKeysetCursor {
  createdAt: Date;
  id: string;
}

export interface CreditHistoryRow {
  id: string;
  delta: number;
  reason: string;
  createdAt: Date;
  queryId: string | null;
  bankNameSnapshot: string | null;
  loanTypeNameSnapshot: string | null;
  statusNameSnapshot: string | null;
}

/**
 * This user's full credit ledger, newest first, keyset-paginated on
 * `(created_at desc, id desc)` — the same idiom `queries.repo.ts`'s
 * `listQueriesForUser` uses. Left-joined against `queries` (not inner) so a
 * manual admin adjustment — `queryId` null — still comes back as a row,
 * just with all three snapshot columns null rather than being dropped.
 */
export async function listCreditHistoryForUser(
  db: DbOrTx,
  userId: string,
  limit: number,
  cursor?: CreditHistoryKeysetCursor,
): Promise<CreditHistoryRow[]> {
  const whereClause = cursor
    ? and(
        eq(creditTransactions.userId, userId),
        or(
          lt(creditTransactions.createdAt, cursor.createdAt),
          and(
            eq(creditTransactions.createdAt, cursor.createdAt),
            lt(creditTransactions.id, cursor.id),
          ),
        ),
      )
    : eq(creditTransactions.userId, userId);

  return db
    .select({
      id: creditTransactions.id,
      delta: creditTransactions.delta,
      reason: creditTransactions.reason,
      createdAt: creditTransactions.createdAt,
      queryId: creditTransactions.queryId,
      bankNameSnapshot: queries.bankNameSnapshot,
      loanTypeNameSnapshot: queries.loanTypeNameSnapshot,
      statusNameSnapshot: queries.statusNameSnapshot,
    })
    .from(creditTransactions)
    .leftJoin(queries, eq(creditTransactions.queryId, queries.id))
    .where(whereClause)
    .orderBy(desc(creditTransactions.createdAt), desc(creditTransactions.id))
    .limit(limit);
}
