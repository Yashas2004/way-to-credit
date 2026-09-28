import { and, asc, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { admins, issueAdminReads, issueMessages, issues, users } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

export type IssueRow = typeof issues.$inferSelect;
export type IssueEntryRow = typeof issueMessages.$inferSelect;
export type IssueStatusValue = IssueRow["status"];
export type EntryKind = IssueEntryRow["kind"];

export interface IssueKeysetCursor {
  lastActivityAt: Date;
  id: string;
}

const NEVER = sql`'-infinity'::timestamptz`;

/** Unread for the raiser: an admin-authored entry newer than their read marker. */
const unreadForUser = sql<boolean>`coalesce(${issues.lastAdminMessageAt} > coalesce(${issues.userLastReadAt}, ${NEVER}), false)`;

/** Unread for one admin: a user-authored entry newer than that admin's own marker. */
const unreadForAdmin = sql<boolean>`coalesce(${issues.lastUserMessageAt} > coalesce(${issueAdminReads.lastReadAt}, ${NEVER}), false)`;

function beforeCursor(cursor: IssueKeysetCursor | undefined): SQL | undefined {
  if (!cursor) return undefined;
  return or(
    lt(issues.lastActivityAt, cursor.lastActivityAt),
    and(eq(issues.lastActivityAt, cursor.lastActivityAt), lt(issues.id, cursor.id)),
  );
}

// ---- writes (callers hold the issue row lock where it matters) -------------

export async function insertIssue(
  db: DbOrTx,
  raisedBy: string,
  subject: string,
): Promise<IssueRow> {
  const [row] = await db.insert(issues).values({ raisedBy, subject }).returning();
  if (!row) throw new Error("Failed to insert issue");
  return row;
}

export interface InsertEntryInput {
  issueId: string;
  kind: EntryKind;
  author: { type: "user"; id: string } | { type: "admin"; id: string };
  body: string;
}

export async function insertEntry(db: DbOrTx, input: InsertEntryInput): Promise<IssueEntryRow> {
  const [row] = await db
    .insert(issueMessages)
    .values({
      issueId: input.issueId,
      kind: input.kind,
      authorType: input.author.type,
      authorUserId: input.author.type === "user" ? input.author.id : null,
      authorAdminId: input.author.type === "admin" ? input.author.id : null,
      body: input.body,
      // clock_timestamp(), not the column's now() default: now() is the
      // *transaction start*, and a writer can start before another but take
      // the row lock after it — its entry would then sort before one it
      // actually followed. Taken after the lock is held, this makes thread
      // order equal commit order. (Rounding to ms can tie two entries of one
      // transaction; the monotonic UUIDv7 id breaks the tie in insert order.)
      sentAt: sql`clock_timestamp()`,
    })
    .returning();
  if (!row) throw new Error("Failed to insert issue entry");
  return row;
}

/** `SELECT … FOR UPDATE` — callers must be inside `runLockedTransaction`. Scoped to the raiser when `raisedBy` is given. */
export async function lockIssue(
  db: DbOrTx,
  id: string,
  raisedBy?: string,
): Promise<IssueRow | undefined> {
  const [row] = await db
    .select()
    .from(issues)
    .where(raisedBy ? and(eq(issues.id, id), eq(issues.raisedBy, raisedBy)) : eq(issues.id, id))
    .for("update")
    .limit(1);
  return row;
}

export interface IssueUpdate {
  status: IssueStatusValue;
  /** The newest entry's sent_at; last_activity_at never moves backwards. */
  activityAt: Date;
  authorType: "user" | "admin";
  /** Omit to leave resolved_* unchanged; null clears it (reopen). */
  resolved?: { at: Date; by: string } | null | undefined;
  /** The author has necessarily read up to their own entry. */
  markAuthorRead: boolean;
}

export async function applyIssueUpdate(db: DbOrTx, id: string, u: IssueUpdate): Promise<IssueRow> {
  const at = u.activityAt;
  const [row] = await db
    .update(issues)
    .set({
      status: u.status,
      lastActivityAt: sql`greatest(${issues.lastActivityAt}, ${at})`,
      ...(u.authorType === "user"
        ? {
            lastUserMessageAt: sql`greatest(coalesce(${issues.lastUserMessageAt}, ${NEVER}), ${at})`,
            ...(u.markAuthorRead
              ? {
                  userLastReadAt: sql`greatest(coalesce(${issues.userLastReadAt}, ${NEVER}), ${at})`,
                }
              : {}),
          }
        : {
            lastAdminMessageAt: sql`greatest(coalesce(${issues.lastAdminMessageAt}, ${NEVER}), ${at})`,
          }),
      ...(u.resolved === undefined
        ? {}
        : { resolvedAt: u.resolved?.at ?? null, resolvedBy: u.resolved?.by ?? null }),
    })
    .where(eq(issues.id, id))
    .returning();
  if (!row) throw new Error("Failed to update issue");
  return row;
}

/**
 * Moves the raiser's read marker forward to `upTo`, clamped to the request's
 * own last activity (a far-future `upTo` can't pre-read messages not yet
 * sent) and never backwards. Returns false when the request isn't theirs.
 */
export async function markReadByUser(
  db: DbOrTx,
  id: string,
  raisedBy: string,
  upTo: Date,
): Promise<boolean> {
  const updated = await db
    .update(issues)
    .set({
      userLastReadAt: sql`greatest(coalesce(${issues.userLastReadAt}, ${NEVER}), least(${upTo}, ${issues.lastActivityAt}))`,
    })
    .where(and(eq(issues.id, id), eq(issues.raisedBy, raisedBy)))
    .returning({ id: issues.id });
  return updated.length > 0;
}

/** Same rules as `markReadByUser`, on this admin's own marker row (created on first read). */
export async function markReadByAdmin(
  db: DbOrTx,
  id: string,
  adminId: string,
  upTo: Date,
): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO ${issueAdminReads} (issue_id, admin_id, last_read_at)
    SELECT ${issues.id}, ${adminId}, least(${upTo}, ${issues.lastActivityAt})
    FROM ${issues} WHERE ${issues.id} = ${id}
    ON CONFLICT (issue_id, admin_id)
    DO UPDATE SET last_read_at = greatest(${issueAdminReads.lastReadAt}, excluded.last_read_at)
  `);
  return (result.rowCount ?? 0) > 0;
}

// ---- reads ------------------------------------------------------------------

const summaryColumns = {
  id: issues.id,
  subject: issues.subject,
  status: issues.status,
  openedAt: issues.openedAt,
  lastActivityAt: issues.lastActivityAt,
  resolvedAt: issues.resolvedAt,
};

export async function listForUser(
  db: DbOrTx,
  userId: string,
  limit: number,
  cursor?: IssueKeysetCursor,
) {
  return db
    .select({ ...summaryColumns, unread: unreadForUser })
    .from(issues)
    .where(and(eq(issues.raisedBy, userId), beforeCursor(cursor)))
    .orderBy(desc(issues.lastActivityAt), desc(issues.id))
    .limit(limit);
}

export async function findForUser(db: DbOrTx, id: string, userId: string) {
  const [row] = await db
    .select({ ...summaryColumns, unread: unreadForUser })
    .from(issues)
    .where(and(eq(issues.id, id), eq(issues.raisedBy, userId)))
    .limit(1);
  return row;
}

export async function countUnreadForUser(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issues)
    .where(and(eq(issues.raisedBy, userId), unreadForUser));
  return row?.count ?? 0;
}

export interface AdminIssueFilters {
  statuses?: IssueStatusValue[] | undefined;
  userId?: string | undefined;
}

const adminSummaryColumns = {
  ...summaryColumns,
  unread: unreadForAdmin,
  raisedBy: issues.raisedBy,
  raisedByUserId: users.userId,
  raisedByDisplayName: users.displayName,
};

function adminBase(db: DbOrTx, adminId: string) {
  return db
    .select(adminSummaryColumns)
    .from(issues)
    .innerJoin(users, eq(users.id, issues.raisedBy))
    .leftJoin(
      issueAdminReads,
      and(eq(issueAdminReads.issueId, issues.id), eq(issueAdminReads.adminId, adminId)),
    );
}

export async function listForAdmin(
  db: DbOrTx,
  adminId: string,
  filters: AdminIssueFilters,
  limit: number,
  cursor?: IssueKeysetCursor,
) {
  return adminBase(db, adminId)
    .where(
      and(
        filters.statuses ? inArray(issues.status, filters.statuses) : undefined,
        filters.userId ? eq(issues.raisedBy, filters.userId) : undefined,
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(issues.lastActivityAt), desc(issues.id))
    .limit(limit);
}

export async function findForAdmin(db: DbOrTx, id: string, adminId: string) {
  const [row] = await adminBase(db, adminId).where(eq(issues.id, id)).limit(1);
  return row;
}

export async function countUnreadForAdmin(db: DbOrTx, adminId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issues)
    .leftJoin(
      issueAdminReads,
      and(eq(issueAdminReads.issueId, issues.id), eq(issueAdminReads.adminId, adminId)),
    )
    .where(unreadForAdmin);
  return row?.count ?? 0;
}

/** The whole thread, oldest first, with each author's display name. */
export async function listEntries(db: DbOrTx, issueId: string) {
  return db
    .select({
      id: issueMessages.id,
      kind: issueMessages.kind,
      authorType: issueMessages.authorType,
      authorName: sql<string>`coalesce(${users.displayName}, ${admins.displayName})`,
      body: issueMessages.body,
      sentAt: issueMessages.sentAt,
    })
    .from(issueMessages)
    .leftJoin(users, eq(users.id, issueMessages.authorUserId))
    .leftJoin(admins, eq(admins.id, issueMessages.authorAdminId))
    .where(eq(issueMessages.issueId, issueId))
    .orderBy(asc(issueMessages.sentAt), asc(issueMessages.id));
}

/**
 * Who wrote the most recent *message* (not status event) in the thread.
 * An explicit reopen hands the request to whoever owes the next move; the
 * denormalised last_admin_message_at can't answer that, because it also
 * advances on an admin's resolve/reopen events (so the user sees them as
 * unread) — a resolve would otherwise look like the admin spoke last.
 */
export async function lastMessageAuthorType(
  db: DbOrTx,
  issueId: string,
): Promise<"user" | "admin" | undefined> {
  const [row] = await db
    .select({ authorType: issueMessages.authorType })
    .from(issueMessages)
    .where(and(eq(issueMessages.issueId, issueId), eq(issueMessages.kind, "message")))
    .orderBy(desc(issueMessages.sentAt), desc(issueMessages.id))
    .limit(1);
  return row?.authorType;
}

export async function countAwaitingAdmin(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issues)
    .where(eq(issues.status, "awaiting_admin"));
  return row?.count ?? 0;
}
