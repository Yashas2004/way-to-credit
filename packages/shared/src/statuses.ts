import { z } from "zod";

export const CreateStatusRequestSchema = z.object({
  name: z.string().min(1).max(200),
  sortOrder: z.number().int(),
});
export type CreateStatusRequest = z.infer<typeof CreateStatusRequestSchema>;

export const UpdateStatusRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateStatusRequest = z.infer<typeof UpdateStatusRequestSchema>;

export const StatusSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Status = z.infer<typeof StatusSchema>;
