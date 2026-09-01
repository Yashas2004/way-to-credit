import { and, desc, eq, gt, gte, isNotNull, isNull, lte, lt, or, sql } from "drizzle-orm";
import {
  activityLog,
  banks,
  creditTransactions,
  queries,
  sessions,
  users,
} from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export type ActivityLogRow = typeof activityLog.$inferSelect;

export interface ActivityFilters {
  actorId?: string;
  from?: Date;
  to?: Date;
}

export interface ActivityKeysetCursor {
  occurredAt: Date;
  id: string;
}

/**
 * Keyset pagination on `(occurredAt desc, id desc)`. When `actorId` is
 * filtered, this hits the existing `activity_log_actor_id_occurred_at_idx`
 * index; an unfiltered "all activity" listing doesn't — accepted as a small
 * admin-dataset tradeoff, not worth a new index for this stage.
 */
export async function listActivity(
  db: DbOrTx,
  filters: ActivityFilters,
  limit: number,
  cursor?: ActivityKeysetCursor,
): Promise<ActivityLogRow[]> {
  const conditions = [];
  if (filters.actorId) conditions.push(eq(activityLog.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(activityLog.occurredAt, filters.from));
  if (filters.to) conditions.push(lte(activityLog.occurredAt, filters.to));
  if (cursor) {
    conditions.push(
      or(
        lt(activityLog.occurredAt, cursor.occurredAt),
        and(eq(activityLog.occurredAt, cursor.occurredAt), lt(activityLog.id, cursor.id)),
      ),
    );
  }

  return db
    .select()
    .from(activityLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(activityLog.occurredAt), desc(activityLog.id))
    .limit(limit);
}

export interface ActiveSessionRow {
  id: string;
  userId: string;
  displayName: string;
  lastSeenAt: Date | null;
}

/** Users (not admins) with at least one non-revoked, unexpired session — `users.lastSeenAt`, not `sessions.lastUsedAt`, is the canonical "last activity" field established in an earlier stage. */
export async function listActiveSessions(db: DbOrTx): Promise<ActiveSessionRow[]> {
  return db
    .selectDistinct({
      id: users.id,
      userId: users.userId,
      displayName: users.displayName,
      lastSeenAt: users.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        isNotNull(sessions.userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(users.lastSeenAt));
}

export interface Stats {
  totalUsers: number;
  activeUsersLast5Minutes: number;
  totalBanks: number;
  pendingQueryCount: number;
  totalCreditsIssued: number;
}

/**
 * 4 aggregate queries, each a single-row scan over its own table — kept to
 * the Drizzle query builder (a `sql<number>` expression per projected
 * column) rather than raw `db.execute`, so results come back through the
 * normal typed-row API. `pendingQueryCount` hits the existing
 * `queries_status_raised_at_idx` composite index (equality on its leading
 * column); the others are plain small-table scans, acceptable at this
 * app's scale for a screen polled every 30s.
 */
export async function getStats(db: DbOrTx): Promise<Stats> {
  const [userStats] = await db
    .select({
      totalUsers: sql<number>`count(*)::int`,
      activeUsersLast5Minutes: sql<number>`count(*) filter (where ${users.lastSeenAt} >= now() - interval '5 minutes')::int`,
    })
    .from(users);

  const [bankStats] = await db
    .select({ totalBanks: sql<number>`count(*)::int` })
    .from(banks)
    .where(isNull(banks.deletedAt));

  const [queryStats] = await db
    .select({ pendingQueryCount: sql<number>`count(*)::int` })
    .from(queries)
    .where(eq(queries.status, "pending"));

  // "Issued" = gross cumulative positive deltas, not the current net
  // balance (SUM(users.creditPoints) would drop after any deduction,
  // contradicting its own label) — see the stage plan's decision.
  const [creditStats] = await db
    .select({
      totalCreditsIssued: sql<number>`coalesce(sum(${creditTransactions.delta}) filter (where ${creditTransactions.delta} > 0), 0)::int`,
    })
    .from(creditTransactions);

  return {
    totalUsers: userStats?.totalUsers ?? 0,
    activeUsersLast5Minutes: userStats?.activeUsersLast5Minutes ?? 0,
    totalBanks: bankStats?.totalBanks ?? 0,
    pendingQueryCount: queryStats?.pendingQueryCount ?? 0,
    totalCreditsIssued: creditStats?.totalCreditsIssued ?? 0,
  };
}
