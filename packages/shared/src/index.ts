import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number(),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
