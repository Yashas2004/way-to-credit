import { and, desc, eq, lt, or } from "drizzle-orm";
import { queries } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export type QueryRow = typeof queries.$inferSelect;

export interface InsertQueryInput {
  raisedBy: string;
  bankId: string;
  loanTypeId: string;
  statusId: string;
  bankNameSnapshot: string;
  loanTypeNameSnapshot: string;
  statusNameSnapshot: string;
  message: string;
}

export async function insertQuery(db: DbOrTx, input: InsertQueryInput): Promise<QueryRow> {
  const [row] = await db.insert(queries).values(input).returning();
  if (!row) {
    throw new Error("Failed to insert query");
  }
  return row;
}

export interface QueryKeysetCursor {
  raisedAt: Date;
  id: string;
}

/** Keyset pagination on `(raisedAt desc, id desc)` — reuses the existing `queries_raised_by_raised_at_idx` index. */
export async function listQueriesForUser(
  db: DbOrTx,
  userId: string,
  limit: number,
  cursor?: QueryKeysetCursor,
): Promise<QueryRow[]> {
  const whereClause = cursor
    ? and(
        eq(queries.raisedBy, userId),
        or(
          lt(queries.raisedAt, cursor.raisedAt),
          and(eq(queries.raisedAt, cursor.raisedAt), lt(queries.id, cursor.id)),
        ),
      )
    : eq(queries.raisedBy, userId);

  return db
    .select()
    .from(queries)
    .where(whereClause)
    .orderBy(desc(queries.raisedAt), desc(queries.id))
    .limit(limit);
}
