import type { WorkspaceNavResponse } from "@way-to-credit/shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import { bankLoanTypes, banks, loanTypes, statuses } from "../db/schema/index.js";
import type { DbOrTx } from "../db/types.js";

export type WorkspaceNav = WorkspaceNavResponse;

/**
 * The Workspace's navigation data, each list once: statuses (global — they
 * apply to every attached pair, so never repeated per pair), loan types, and
 * banks with the loan types they offer as indexes into that list. Four small
 * queries; no cross join. This replaced a tree that repeated every status
 * under every pair: banks x loan-types-per-bank x statuses rows, which at
 * 1000 x 5 x 1000 was 5M rows, 21.6 s and 2.2 GB of heap and couldn't be
 * cached at all. This shape is 262 KB raw at that size (CLAUDE.md
 * invariant 19). Only live (not soft-deleted) rows appear; a bank with
 * nothing attached yet is listed with an empty loanTypes array, so the
 * client can say so rather than show an empty dropdown.
 */
export async function buildWorkspaceNav(db: DbOrTx): Promise<WorkspaceNav> {
  const [statusRows, loanTypeRows, bankRows, attachmentRows] = await Promise.all([
    db
      .select({ id: statuses.id, name: statuses.name, sortOrder: statuses.sortOrder })
      .from(statuses)
      .where(isNull(statuses.deletedAt))
      .orderBy(asc(statuses.sortOrder), asc(statuses.name)),
    db
      .select({ id: loanTypes.id, name: loanTypes.name })
      .from(loanTypes)
      .where(isNull(loanTypes.deletedAt))
      .orderBy(asc(loanTypes.name)),
    db
      .select({ id: banks.id, name: banks.name })
      .from(banks)
      .where(isNull(banks.deletedAt))
      .orderBy(asc(banks.name)),
    db
      .select({ bankId: bankLoanTypes.bankId, loanTypeId: bankLoanTypes.loanTypeId })
      .from(bankLoanTypes)
      .innerJoin(
        loanTypes,
        and(eq(loanTypes.id, bankLoanTypes.loanTypeId), isNull(loanTypes.deletedAt)),
      ),
  ]);

  const loanTypeIndex = new Map(loanTypeRows.map((lt, i) => [lt.id, i]));
  const offered = new Map<string, number[]>();
  for (const { bankId, loanTypeId } of attachmentRows) {
    const index = loanTypeIndex.get(loanTypeId);
    if (index === undefined) continue;
    const list = offered.get(bankId);
    if (list) list.push(index);
    else offered.set(bankId, [index]);
  }

  return {
    statuses: statusRows,
    loanTypes: loanTypeRows,
    banks: bankRows.map((b) => ({
      id: b.id,
      name: b.name,
      // Name order, like the loan type list itself.
      loanTypes: (offered.get(b.id) ?? []).sort((x, y) => x - y),
    })),
  };
}
