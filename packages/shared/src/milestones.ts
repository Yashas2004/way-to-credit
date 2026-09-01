import { z } from "zod";
import { uuidParam } from "./common.js";

export const CreateMilestoneRequestSchema = z.object({
  levelNumber: z.number().int().positive(),
  pointsRequired: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(1000),
});
export type CreateMilestoneRequest = z.infer<typeof CreateMilestoneRequestSchema>;

/** `levelNumber` is immutable post-creation — not included here. */
export const UpdateMilestoneRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  message: z.string().trim().min(1).max(1000).optional(),
  pointsRequired: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMilestoneRequest = z.infer<typeof UpdateMilestoneRequestSchema>;

export const MilestoneResponseSchema = z.object({
  id: uuidParam,
  levelNumber: z.number().int(),
  pointsRequired: z.number().int(),
  title: z.string(),
  message: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MilestoneResponse = z.infer<typeof MilestoneResponseSchema>;
