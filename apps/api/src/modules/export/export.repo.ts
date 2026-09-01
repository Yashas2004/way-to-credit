import { and, asc, eq, isNull } from "drizzle-orm";
import { banks, descriptions, loanTypes, statuses } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export interface ExportRow {
  bankName: string;
  loanTypeName: string;
  statusName: string;
  body: string;
}

/** Knowledge-base content only — no users, no credentials, no hashes. */
export async function listExportRows(db: DbOrTx): Promise<ExportRow[]> {
  return db
    .select({
      bankName: banks.name,
      loanTypeName: loanTypes.name,
      statusName: statuses.name,
      body: descriptions.body,
    })
    .from(descriptions)
    .innerJoin(banks, eq(descriptions.bankId, banks.id))
    .innerJoin(loanTypes, eq(descriptions.loanTypeId, loanTypes.id))
    .innerJoin(statuses, eq(descriptions.statusId, statuses.id))
    .where(and(isNull(banks.deletedAt), isNull(loanTypes.deletedAt), isNull(statuses.deletedAt)))
    .orderBy(asc(banks.name), asc(loanTypes.name), asc(statuses.sortOrder));
}
