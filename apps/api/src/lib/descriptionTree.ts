import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { bankLoanTypes, banks, descriptions, loanTypes, statuses } from "../db/schema/index.js";
import type { DbOrTx } from "../db/types.js";

export interface DescriptionTreeStatus {
  statusId: string;
  statusName: string;
  sortOrder: number;
  body: string;
}

export interface DescriptionTreeLoanType {
  loanTypeId: string;
  loanTypeName: string;
  statuses: DescriptionTreeStatus[];
}

export interface DescriptionTreeBank {
  bankId: string;
  bankName: string;
  loanTypes: DescriptionTreeLoanType[];
}

/**
 * The one query that defines "the description tree" — anchored on banks →
 * bank_loan_types → loan_types → every active status, with `descriptions`
 * only LEFT JOINed in for the body. Never anchored on `descriptions` at any
 * level: a (bank, loan type, status) triple exists as soon as the pair is
 * wired, and its body defaults to "NA" until an admin writes one (spec:
 * "defaults to NA until admin fills it in"). This used to reach statuses
 * *through* descriptions, so only seeded pairs (whose NA rows the seed
 * script materialises) showed statuses — every admin-created bank or newly
 * attached loan type showed none. Same shape as the admin grid and the
 * single-description lookup, which already synthesised NA.
 *
 * Shared by the Redis cache (lib/cache.ts) and the user-facing tree read —
 * written once here so the two can't independently drift apart.
 */
export async function buildDescriptionTree(db: DbOrTx): Promise<DescriptionTreeBank[]> {
  const rows = await db
    .select({
      bankId: banks.id,
      bankName: banks.name,
      loanTypeId: loanTypes.id,
      loanTypeName: loanTypes.name,
      statusId: statuses.id,
      statusName: statuses.name,
      sortOrder: statuses.sortOrder,
      body: descriptions.body,
    })
    .from(banks)
    .leftJoin(bankLoanTypes, eq(bankLoanTypes.bankId, banks.id))
    .leftJoin(
      loanTypes,
      and(eq(loanTypes.id, bankLoanTypes.loanTypeId), isNull(loanTypes.deletedAt)),
    )
    // Every active status, for every wired pair — a conditional cross join.
    .leftJoin(statuses, and(isNotNull(loanTypes.id), isNull(statuses.deletedAt)))
    .leftJoin(
      descriptions,
      and(
        eq(descriptions.bankId, banks.id),
        eq(descriptions.loanTypeId, loanTypes.id),
        eq(descriptions.statusId, statuses.id),
      ),
    )
    .where(isNull(banks.deletedAt))
    .orderBy(asc(banks.name), asc(loanTypes.name), asc(statuses.sortOrder));

  const bankMap = new Map<string, DescriptionTreeBank>();

  for (const row of rows) {
    let bank = bankMap.get(row.bankId);
    if (!bank) {
      bank = { bankId: row.bankId, bankName: row.bankName, loanTypes: [] };
      bankMap.set(row.bankId, bank);
    }

    if (row.loanTypeId === null) {
      continue; // bank with no wired loan types
    }

    let loanType = bank.loanTypes.find((lt) => lt.loanTypeId === row.loanTypeId);
    if (!loanType) {
      loanType = {
        loanTypeId: row.loanTypeId,
        loanTypeName: row.loanTypeName ?? "",
        statuses: [],
      };
      bank.loanTypes.push(loanType);
    }

    if (row.statusId === null) {
      continue; // wired pair, but no active statuses exist at all
    }

    loanType.statuses.push({
      statusId: row.statusId,
      statusName: row.statusName ?? "",
      sortOrder: row.sortOrder ?? 0,
      body: row.body ?? "NA",
    });
  }

  return [...bankMap.values()];
}
