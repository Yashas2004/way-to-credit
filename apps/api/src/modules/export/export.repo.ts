import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { bankLoanTypes, banks, descriptions, loanTypes, statuses } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export const NO_LOAN_TYPES_ATTACHED = "(No loan types attached yet)";
export const NO_STATUSES_DEFINED = "(No statuses defined yet)";

export interface ExportRow {
  bankName: string;
  loanTypeName: string;
  statusName: string;
  body: string;
}

/**
 * Knowledge-base content only — no users, no credentials, no hashes.
 *
 * Anchored on banks → bank_loan_types → loan_types → every active status,
 * with descriptions LEFT JOINed only for the body — the same shape as
 * lib/descriptionTree.ts. This used to select FROM descriptions, so any bank
 * with no description rows (i.e. every bank an admin created, since only the
 * seed script materialises NA rows) was missing from the export entirely.
 * Now: a wired triple with no description exports as "NA", and a bank with
 * nothing attached yet gets one row saying so, so the file really does
 * contain every bank.
 */
export async function listExportRows(db: DbOrTx): Promise<ExportRow[]> {
  const rows = await db
    .select({
      bankName: banks.name,
      loanTypeName: loanTypes.name,
      statusName: statuses.name,
      body: descriptions.body,
    })
    .from(banks)
    .leftJoin(bankLoanTypes, eq(bankLoanTypes.bankId, banks.id))
    .leftJoin(
      loanTypes,
      and(eq(loanTypes.id, bankLoanTypes.loanTypeId), isNull(loanTypes.deletedAt)),
    )
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

  const result: ExportRow[] = [];
  const bankNamesWithRows = new Set<string>();

  for (const row of rows) {
    if (row.loanTypeName === null) {
      continue; // unattached bank, or an attachment to a soft-deleted loan type
    }
    bankNamesWithRows.add(row.bankName);
    if (row.statusName === null) {
      // Attached, but no active statuses exist anywhere yet. The pair still
      // gets its row — it must not fall through to the "no loan types
      // attached" label below, which would be false.
      result.push({
        bankName: row.bankName,
        loanTypeName: row.loanTypeName,
        statusName: NO_STATUSES_DEFINED,
        body: "",
      });
      continue;
    }
    result.push({
      bankName: row.bankName,
      loanTypeName: row.loanTypeName,
      statusName: row.statusName,
      body: row.body ?? "NA",
    });
  }

  // A bank with nothing attached still appears, once — omitting it would
  // silently drop a bank the admin created from an export that's meant to
  // be "all entered data". The reason goes in the cell rather than leaving
  // blanks, which read as corrupt data at a glance.
  for (const row of rows) {
    if (!bankNamesWithRows.has(row.bankName)) {
      bankNamesWithRows.add(row.bankName);
      result.push({
        bankName: row.bankName,
        loanTypeName: NO_LOAN_TYPES_ATTACHED,
        statusName: "",
        body: "",
      });
    }
  }

  return result.sort((a, b) => a.bankName.localeCompare(b.bankName));
}
