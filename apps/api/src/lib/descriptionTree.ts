import { and, asc, eq, isNull } from "drizzle-orm";
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
 * bank_loan_types → loan_types (not on descriptions), so a freshly-wired
 * bank+loanType pair with zero description rows yet still appears, with an
 * empty status list, rather than silently vanishing. A status only appears
 * once it has a real `descriptions` row — that row's existence is what
 * makes it "applicable" — so this is a distinct (sparser) view than the
 * admin curation grid in modules/descriptions, which synthesizes 'NA' rows
 * for every status regardless of whether a description exists yet.
 *
 * Reused by both this stage's cache (lib/cache.ts) and, later, the
 * user-facing tree-read route — write the filtering logic once here so the
 * two can't independently drift apart.
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
    .leftJoin(
      descriptions,
      and(eq(descriptions.bankId, banks.id), eq(descriptions.loanTypeId, loanTypes.id)),
    )
    .leftJoin(statuses, and(eq(statuses.id, descriptions.statusId), isNull(statuses.deletedAt)))
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
      continue; // wired pair with no description rows yet
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
