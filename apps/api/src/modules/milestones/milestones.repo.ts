import { asc, eq } from "drizzle-orm";
import { milestones } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export type MilestoneRow = typeof milestones.$inferSelect;

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
