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

export const MarkMilestoneSeenResponseSchema = z.object({ status: z.literal("ok") });
export type MarkMilestoneSeenResponse = z.infer<typeof MarkMilestoneSeenResponseSchema>;

export const AdjustCreditsRequestSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .refine((v) => v !== 0, "delta must be non-zero"),
  reason: z.string().trim().min(1).max(500),
});
export type AdjustCreditsRequest = z.infer<typeof AdjustCreditsRequestSchema>;

export const NewlyUnlockedMilestoneSchema = z.object({
  milestoneId: uuidParam,
  levelNumber: z.number().int(),
  title: z.string(),
});
export type NewlyUnlockedMilestone = z.infer<typeof NewlyUnlockedMilestoneSchema>;

export const AdjustCreditsResponseSchema = z.object({
  userId: uuidParam,
  creditPoints: z.number().int(),
  newlyUnlockedMilestones: z.array(NewlyUnlockedMilestoneSchema),
});
export type AdjustCreditsResponse = z.infer<typeof AdjustCreditsResponseSchema>;
