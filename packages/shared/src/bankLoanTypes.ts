import { z } from "zod";

export const BankLoanTypeSchema = z.object({
  bankId: z.string().uuid(),
  loanTypeId: z.string().uuid(),
  createdAt: z.string(),
});
export type BankLoanType = z.infer<typeof BankLoanTypeSchema>;
