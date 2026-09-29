import { and, eq, isNull, sql } from "drizzle-orm";
import { bankLoanTypes, banks, descriptions, loanTypes, statuses } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

/**
 * One (bank, loan type, status) lookup, straight from Postgres — descriptions
 * are not cached (CLAUDE.md invariant 19). A single indexed query that also
 * re-checks everything the answer depends on: the bank, loan type and status
 * are live and the pair is attached. Returns undefined when any of those
 * fails (the combination is withdrawn); otherwise the body, or "NA" when no
 * description has been written. ~1 ms at any measured scale.
 */
export async function findDescriptionForTriple(
  db: DbOrTx,
  bankId: string,
  loanTypeId: string,
  statusId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ body: sql<string>`coalesce(${descriptions.body}, 'NA')` })
    .from(bankLoanTypes)
    .innerJoin(banks, and(eq(banks.id, bankLoanTypes.bankId), isNull(banks.deletedAt)))
    .innerJoin(
      loanTypes,
      and(eq(loanTypes.id, bankLoanTypes.loanTypeId), isNull(loanTypes.deletedAt)),
    )
    .innerJoin(statuses, and(eq(statuses.id, statusId), isNull(statuses.deletedAt)))
    .leftJoin(
      descriptions,
      and(
        eq(descriptions.bankId, bankLoanTypes.bankId),
        eq(descriptions.loanTypeId, bankLoanTypes.loanTypeId),
        eq(descriptions.statusId, statuses.id),
      ),
    )
    .where(and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, loanTypeId)))
    .limit(1);
  return row?.body;
}
