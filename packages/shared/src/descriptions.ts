import { z } from "zod";

export const UpsertDescriptionRequestSchema = z.object({
  bankId: z.string().uuid(),
  loanTypeId: z.string().uuid(),
  statusId: z.string().uuid(),
  body: z.string().min(1).max(5000),
});
export type UpsertDescriptionRequest = z.infer<typeof UpsertDescriptionRequestSchema>;

export const DescriptionRowSchema = z.object({
  id: z.string().uuid(),
  bankId: z.string().uuid(),
  loanTypeId: z.string().uuid(),
  statusId: z.string().uuid(),
  body: z.string(),
  updatedBy: z.string().uuid(),
  updatedAt: z.string(),
});
export type DescriptionRow = z.infer<typeof DescriptionRowSchema>;

export const DescriptionGridQuerySchema = z.object({
  bankId: z.string().uuid(),
  loanTypeId: z.string().uuid(),
});
export type DescriptionGridQuery = z.infer<typeof DescriptionGridQuerySchema>;

/** One row per active status for a (bank, loan type) pair — 'NA' rows are synthesized for statuses with no description yet. */
export const DescriptionGridRowSchema = z.object({
  statusId: z.string().uuid(),
  statusName: z.string(),
  sortOrder: z.number().int(),
  body: z.string(),
  updatedAt: z.string().nullable(),
  updatedBy: z.string().uuid().nullable(),
});
export type DescriptionGridRow = z.infer<typeof DescriptionGridRowSchema>;

export const DescriptionGridResponseSchema = z.object({
  wired: z.boolean(),
  rows: z.array(DescriptionGridRowSchema),
});
export type DescriptionGridResponse = z.infer<typeof DescriptionGridResponseSchema>;
