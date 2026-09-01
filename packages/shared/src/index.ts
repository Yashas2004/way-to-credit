import { z } from "zod";

export * from "./auth.js";
export * from "./bankLoanTypes.js";
export * from "./banks.js";
export * from "./common.js";
export * from "./credits.js";
export * from "./descriptions.js";
export * from "./loanTypes.js";
export * from "./lookup.js";
export * from "./queries.js";
export * from "./statuses.js";
export * from "./users.js";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number(),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
