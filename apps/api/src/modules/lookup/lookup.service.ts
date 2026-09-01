import type { DescriptionLookupResponse, UserTreeResponse } from "@way-to-credit/shared";
import { db } from "../../db/client.js";
import { getDescriptionTree } from "../../lib/cache.js";
import { NotFoundError } from "../../lib/errors.js";
import { findStatusById } from "../statuses/statuses.repo.js";

const WITHDRAWN_MESSAGE = "This bank/loan-type/status combination is not available.";

/**
 * Strips description bodies from the cached tree — `getDescriptionTree()`
 * carries real body text on every status entry (it's the same cache the
 * admin stage populates), and this route must never ship it. See stage
 * decision #1: this shaping happens here, once, not in the cache itself.
 */
export async function getUserTree(): Promise<UserTreeResponse> {
  const tree = await getDescriptionTree();
  return tree.map((bank) => ({
    bankId: bank.bankId,
    bankName: bank.bankName,
    loanTypes: bank.loanTypes.map((loanType) => ({
      loanTypeId: loanType.loanTypeId,
      loanTypeName: loanType.loanTypeName,
      statuses: loanType.statuses.map((status) => ({
        statusId: status.statusId,
        statusName: status.statusName,
        sortOrder: status.sortOrder,
      })),
    })),
  }));
}

/**
 * See stage decision #3 for the full truth table. The cached tree only
 * nests non-deleted, wired banks/loan-types, and only lists a status once
 * a real `descriptions` row exists for it — so a miss on `statusId` within
 * an otherwise-valid pair is ambiguous (valid-but-undescribed vs.
 * invalid/deleted) and needs one extra, real DB check to resolve.
 */
export async function getDescriptionForTriple(
  bankId: string,
  loanTypeId: string,
  statusId: string,
): Promise<DescriptionLookupResponse> {
  const tree = await getDescriptionTree();

  const bank = tree.find((b) => b.bankId === bankId);
  if (!bank) {
    throw new NotFoundError(WITHDRAWN_MESSAGE);
  }

  const loanType = bank.loanTypes.find((lt) => lt.loanTypeId === loanTypeId);
  if (!loanType) {
    throw new NotFoundError(WITHDRAWN_MESSAGE);
  }

  const status = loanType.statuses.find((s) => s.statusId === statusId);
  if (status) {
    return { body: status.body };
  }

  const statusRow = await findStatusById(db, statusId);
  if (!statusRow || statusRow.deletedAt) {
    throw new NotFoundError(WITHDRAWN_MESSAGE);
  }

  return { body: "NA" };
}
