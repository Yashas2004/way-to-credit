import { z } from "zod";
import { uuidParam } from "./common.js";

export const ActivityEventSchema = z.enum(["login", "logout", "forced_logout"]);
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

export const ActivityActorTypeSchema = z.enum(["admin", "user"]);
export type ActivityActorType = z.infer<typeof ActivityActorTypeSchema>;

export const ActivityLogRowSchema = z.object({
  id: uuidParam,
  actorId: uuidParam,
  actorType: ActivityActorTypeSchema,
  event: ActivityEventSchema,
  occurredAt: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type ActivityLogRow = z.infer<typeof ActivityLogRowSchema>;

export const ActivityLogQuerySchema = z.object({
  actorId: uuidParam.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().optional(),
});
export type ActivityLogQuery = z.infer<typeof ActivityLogQuerySchema>;

export const ActivityLogResponseSchema = z.object({
  items: z.array(ActivityLogRowSchema),
  nextCursor: z.string().nullable(),
});
export type ActivityLogResponse = z.infer<typeof ActivityLogResponseSchema>;

export const ActiveSessionRowSchema = z.object({
  id: uuidParam,
  userId: z.string(),
  displayName: z.string(),
  lastSeenAt: z.string().nullable(),
});
export type ActiveSessionRow = z.infer<typeof ActiveSessionRowSchema>;

export const ActiveSessionsResponseSchema = z.array(ActiveSessionRowSchema);
export type ActiveSessionsResponse = z.infer<typeof ActiveSessionsResponseSchema>;

export const StatsResponseSchema = z.object({
  totalUsers: z.number().int(),
  activeUsersLast5Minutes: z.number().int(),
  totalBanks: z.number().int(),
  pendingQueryCount: z.number().int(),
  totalCreditsIssued: z.number().int(),
});
export type StatsResponse = z.infer<typeof StatsResponseSchema>;
