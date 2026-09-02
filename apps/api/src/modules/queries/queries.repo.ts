import { and, asc, desc, eq, gt, gte, lt, lte, or } from "drizzle-orm";
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

export async function findQueryById(db: DbOrTx, id: string): Promise<QueryRow | undefined> {
  const [row] = await db.select().from(queries).where(eq(queries.id, id)).limit(1);
  return row;
}

export type QueryStatusValue = "pending" | "approved" | "rejected";

/**
 * The entire concurrency guard for approve/reject — a bare guarded
 * `UPDATE ... WHERE status='pending' RETURNING *`, no prior `SELECT ...
 * FOR UPDATE`. Under READ COMMITTED, a second concurrent UPDATE targeting
 * the same row blocks until the first commits, then re-evaluates its own
 * WHERE clause against the now-committed row and finds zero matches — no
 * lost update, no window where two callers both see `status='pending'`.
 * This is CLAUDE.md invariant #12's wording verbatim, not a deviation from
 * the SELECT-FOR-UPDATE-first idiom used elsewhere in this codebase (that
 * idiom exists for guards that need a separate dependent-row check; this
 * guard's entire state lives in the row being written, so the UPDATE's own
 * atomicity is sufficient).
 */
export async function updateQueryStatus(
  db: DbOrTx,
  id: string,
  status: "approved" | "rejected",
  resolvedBy: string,
): Promise<QueryRow | undefined> {
  const [row] = await db
    .update(queries)
    .set({ status, resolvedAt: new Date(), resolvedBy })
    .where(and(eq(queries.id, id), eq(queries.status, "pending")))
    .returning();
  return row;
}

export interface AdminQueryFilters {
  status?: QueryStatusValue;
  userId?: string;
  from?: Date;
  to?: Date;
}

/**
 * `sort` flips both the `orderBy` direction and the keyset cursor's
 * comparison operators together — `asc` isn't just `desc` read backwards,
 * a cursor built for one direction is wrong for the other. In practice
 * only the dashboard's "oldest pending queries" widget ever passes `asc`,
 * and only ever without a cursor (its first, only page) — the query inbox
 * screen itself always wants newest-first, `desc`'s existing default.
 */
export async function listQueriesForAdmin(
  db: DbOrTx,
  filters: AdminQueryFilters,
  limit: number,
  cursor?: QueryKeysetCursor,
  sort: "asc" | "desc" = "desc",
): Promise<QueryRow[]> {
  const conditions = [];
  if (filters.status) conditions.push(eq(queries.status, filters.status));
  if (filters.userId) conditions.push(eq(queries.raisedBy, filters.userId));
  if (filters.from) conditions.push(gte(queries.raisedAt, filters.from));
  if (filters.to) conditions.push(lte(queries.raisedAt, filters.to));
  if (cursor) {
    conditions.push(
      sort === "asc"
        ? or(
            gt(queries.raisedAt, cursor.raisedAt),
            and(eq(queries.raisedAt, cursor.raisedAt), gt(queries.id, cursor.id)),
          )
        : or(
            lt(queries.raisedAt, cursor.raisedAt),
            and(eq(queries.raisedAt, cursor.raisedAt), lt(queries.id, cursor.id)),
          ),
    );
  }

  return db
    .select()
    .from(queries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      sort === "asc" ? asc(queries.raisedAt) : desc(queries.raisedAt),
      sort === "asc" ? asc(queries.id) : desc(queries.id),
    )
    .limit(limit);
}
