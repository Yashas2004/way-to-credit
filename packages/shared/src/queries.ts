import { z } from "zod";
import { uuidParam } from "./common.js";

export const RaiseQueryRequestSchema = z.object({
  bankId: uuidParam,
  loanTypeId: uuidParam,
  statusId: uuidParam,
  // .trim() must run before .min(1) so a whitespace-only message fails validation.
  message: z.string().trim().min(1).max(1000),
});
export type RaiseQueryRequest = z.infer<typeof RaiseQueryRequestSchema>;

export const QueryStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type QueryStatus = z.infer<typeof QueryStatusSchema>;

/** A user's own query row — snapshot names only, never live-joined; `resolvedBy` (an admin id) is deliberately omitted. */
export const QueryRowSchema = z.object({
  id: uuidParam,
  bankId: uuidParam,
  loanTypeId: uuidParam,
  statusId: uuidParam,
  bankNameSnapshot: z.string(),
  loanTypeNameSnapshot: z.string(),
  statusNameSnapshot: z.string(),
  message: z.string(),
  status: QueryStatusSchema,
  raisedAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type QueryRow = z.infer<typeof QueryRowSchema>;

export const ListQueriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().optional(),
});
export type ListQueriesQuery = z.infer<typeof ListQueriesQuerySchema>;

export const ListQueriesResponseSchema = z.object({
  items: z.array(QueryRowSchema),
  nextCursor: z.string().nullable(),
});
export type ListQueriesResponse = z.infer<typeof ListQueriesResponseSchema>;
