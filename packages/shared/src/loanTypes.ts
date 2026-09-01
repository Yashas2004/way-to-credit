import { z } from "zod";

export const CreateLoanTypeRequestSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateLoanTypeRequest = z.infer<typeof CreateLoanTypeRequestSchema>;

export const UpdateLoanTypeRequestSchema = z.object({
  name: z.string().min(1).max(200),
});
export type UpdateLoanTypeRequest = z.infer<typeof UpdateLoanTypeRequestSchema>;

export const LoanTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LoanType = z.infer<typeof LoanTypeSchema>;
