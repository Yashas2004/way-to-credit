import { z } from "zod";
import { uuidParam } from "./common.js";

/** Live-joined against `milestones`, not a snapshot — see stage decision #10: `userMilestones` has no title/message snapshot columns. */
export const UnlockedMilestoneSchema = z.object({
  milestoneId: uuidParam,
  levelNumber: z.number().int(),
  pointsRequired: z.number().int(),
  title: z.string(),
  message: z.string(),
  unlockedAt: z.string(),
});
export type UnlockedMilestone = z.infer<typeof UnlockedMilestoneSchema>;

export const MyCreditsResponseSchema = z.object({
  creditPoints: z.number().int(),
  milestones: z.array(UnlockedMilestoneSchema),
});
export type MyCreditsResponse = z.infer<typeof MyCreditsResponseSchema>;
