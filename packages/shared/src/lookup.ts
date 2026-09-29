import { z } from "zod";
import { uuidParam } from "./common.js";

/**
 * Everything the Workspace needs to navigate, each list shipped ONCE.
 * Statuses are global (every active status applies to every attached
 * bank/loan-type pair), so they are never repeated per pair; a bank lists
 * the loan types it offers as indexes into `loanTypes`. Never includes a
 * description body — those are looked up one triple at a time. Measured:
 * 5 KB gzipped at realistic scale, 249 KB at 1000 x 1000 x 1000 (see
 * CLAUDE.md invariant 19).
 */
export const WorkspaceNavResponseSchema = z.object({
  /** Lifecycle order. */
  statuses: z.array(z.object({ id: uuidParam, name: z.string(), sortOrder: z.number().int() })),
  /** Name order. */
  loanTypes: z.array(z.object({ id: uuidParam, name: z.string() })),
  /** Name order. `loanTypes` holds indexes into the top-level `loanTypes`; empty when none are attached yet. */
  banks: z.array(
    z.object({ id: uuidParam, name: z.string(), loanTypes: z.array(z.number().int()) }),
  ),
});
export type WorkspaceNavResponse = z.infer<typeof WorkspaceNavResponseSchema>;

export const DescriptionLookupQuerySchema = z.object({
  bankId: uuidParam,
  loanTypeId: uuidParam,
  statusId: uuidParam,
});
export type DescriptionLookupQuery = z.infer<typeof DescriptionLookupQuerySchema>;

export const DescriptionLookupResponseSchema = z.object({ body: z.string() });
export type DescriptionLookupResponse = z.infer<typeof DescriptionLookupResponseSchema>;
