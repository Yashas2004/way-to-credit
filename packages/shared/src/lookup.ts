import { z } from "zod";
import { uuidParam } from "./common.js";

/** No `body` field — the dropdown tree must never ship description text. */
export const UserTreeStatusSchema = z.object({
  statusId: uuidParam,
  statusName: z.string(),
  sortOrder: z.number().int(),
});
export type UserTreeStatus = z.infer<typeof UserTreeStatusSchema>;

export const UserTreeLoanTypeSchema = z.object({
  loanTypeId: uuidParam,
  loanTypeName: z.string(),
  statuses: z.array(UserTreeStatusSchema),
});
export type UserTreeLoanType = z.infer<typeof UserTreeLoanTypeSchema>;

export const UserTreeBankSchema = z.object({
  bankId: uuidParam,
  bankName: z.string(),
  loanTypes: z.array(UserTreeLoanTypeSchema),
});
export type UserTreeBank = z.infer<typeof UserTreeBankSchema>;

export const UserTreeResponseSchema = z.array(UserTreeBankSchema);
export type UserTreeResponse = z.infer<typeof UserTreeResponseSchema>;

export const DescriptionLookupQuerySchema = z.object({
  bankId: uuidParam,
  loanTypeId: uuidParam,
  statusId: uuidParam,
});
export type DescriptionLookupQuery = z.infer<typeof DescriptionLookupQuerySchema>;

export const DescriptionLookupResponseSchema = z.object({ body: z.string() });
export type DescriptionLookupResponse = z.infer<typeof DescriptionLookupResponseSchema>;
