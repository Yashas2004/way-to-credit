import { asc, eq, sql } from "drizzle-orm";
import { milestones, userMilestones } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export type MilestoneRow = typeof milestones.$inferSelect;

export interface MilestoneWithUnlockCount extends MilestoneRow {
  unlockedCount: number;
}

export interface CreateMilestoneInput {
  levelNumber: number;
  pointsRequired: number;
  title: string;
  message: string;
}

export async function createMilestone(
  db: DbOrTx,
  input: CreateMilestoneInput,
): Promise<MilestoneRow> {
  const [row] = await db.insert(milestones).values(input).returning();
  if (!row) {
    throw new Error("Failed to create milestone");
  }
  return row;
}

export async function listMilestones(db: DbOrTx): Promise<MilestoneRow[]> {
  return db.select().from(milestones).orderBy(asc(milestones.levelNumber));
}

/**
 * Same list, plus how many users have unlocked each one — a single
 * LEFT JOIN + GROUP BY (not N+1 count queries), matching the
 * `sql<number>` + `::int` cast convention `activity.repo.ts`'s `getStats`
 * already established for aggregate columns through the Drizzle query
 * builder. A milestone nobody has unlocked yet still appears, at 0 (LEFT
 * JOIN, not INNER).
 */
export async function listMilestonesWithUnlockCounts(
  db: DbOrTx,
): Promise<MilestoneWithUnlockCount[]> {
  return db
    .select({
      id: milestones.id,
      levelNumber: milestones.levelNumber,
      pointsRequired: milestones.pointsRequired,
      title: milestones.title,
      message: milestones.message,
      isActive: milestones.isActive,
      createdAt: milestones.createdAt,
      updatedAt: milestones.updatedAt,
      unlockedCount: sql<number>`count(${userMilestones.id})::int`,
    })
    .from(milestones)
    .leftJoin(userMilestones, eq(userMilestones.milestoneId, milestones.id))
    .groupBy(milestones.id)
    .orderBy(asc(milestones.levelNumber));
}

/** For a single milestone's response after create/update/deactivate/reactivate — see `listMilestonesWithUnlockCounts` for the list-view equivalent. */
export async function countUnlockedForMilestone(db: DbOrTx, milestoneId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userMilestones)
    .where(eq(userMilestones.milestoneId, milestoneId));
  return row?.count ?? 0;
}

export async function findMilestoneById(db: DbOrTx, id: string): Promise<MilestoneRow | undefined> {
  const [row] = await db.select().from(milestones).where(eq(milestones.id, id)).limit(1);
  return row;
}

export interface UpdateMilestoneInput {
  title?: string | undefined;
  message?: string | undefined;
  pointsRequired?: number | undefined;
  isActive?: boolean | undefined;
}

export async function updateMilestone(
  db: DbOrTx,
  id: string,
  input: UpdateMilestoneInput,
): Promise<MilestoneRow | undefined> {
  const [row] = await db.update(milestones).set(input).where(eq(milestones.id, id)).returning();
  return row;
}
