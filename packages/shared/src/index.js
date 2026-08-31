import { z } from "zod";
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number(),
  version: z.string(),
});
//# sourceMappingURL=index.js.map
