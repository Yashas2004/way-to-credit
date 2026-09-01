import { z } from "zod";

/** For validating a `:id`-shaped path param, the same `Schema.safeParse(...)` idiom used for bodies. */
export const uuidParam = z.string().uuid();

/** Query-string booleans arrive as strings; `z.coerce.boolean()` is a footgun (`Boolean("false") === true`). */
export const includeDeletedQuerySchema = z.object({
  includeDeleted: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});
export type IncludeDeletedQuery = z.infer<typeof includeDeletedQuerySchema>;
