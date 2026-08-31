import { z } from "zod";
export declare const HealthResponseSchema: z.ZodObject<
  {
    status: z.ZodLiteral<"ok">;
    uptime: z.ZodNumber;
    version: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    status: "ok";
    uptime: number;
    version: string;
  },
  {
    status: "ok";
    uptime: number;
    version: string;
  }
>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
//# sourceMappingURL=index.d.ts.map
