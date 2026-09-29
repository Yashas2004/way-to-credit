import type { DescriptionLookupResponse, WorkspaceNavResponse } from "@way-to-credit/shared";
import { db } from "../../db/client.js";
import { getWorkspaceNav } from "../../lib/cache.js";
import { NotFoundError } from "../../lib/errors.js";
import { findDescriptionForTriple } from "./lookup.repo.js";

const WITHDRAWN_MESSAGE = "This bank/loan-type/status combination is not available.";

/** The Workspace's navigation data, each list once, from cache (CLAUDE.md invariant 19). */
export async function getNavigation(): Promise<WorkspaceNavResponse> {
  return getWorkspaceNav();
}

/**
 * One description, looked up when the user asks for it. Withdrawn — a
 * soft-deleted bank, loan type or status, or a pair that isn't attached —
 * is a 404; attached but not yet written is "NA".
 */
export async function getDescriptionForTriple(
  bankId: string,
  loanTypeId: string,
  statusId: string,
): Promise<DescriptionLookupResponse> {
  const body = await findDescriptionForTriple(db, bankId, loanTypeId, statusId);
  if (body === undefined) {
    throw new NotFoundError(WITHDRAWN_MESSAGE);
  }
  return { body };
}
