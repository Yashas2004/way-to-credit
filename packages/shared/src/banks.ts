import { z } from "zod";

export const CreateBankRequestSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateBankRequest = z.infer<typeof CreateBankRequestSchema>;

export const UpdateBankRequestSchema = z.object({
  name: z.string().min(1).max(200),
});
export type UpdateBankRequest = z.infer<typeof UpdateBankRequestSchema>;

export const BankSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Bank = z.infer<typeof BankSchema>;
