import { eq } from "drizzle-orm";
import { milestones, userMilestones, users } from "../../db/schema/index.js";
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
