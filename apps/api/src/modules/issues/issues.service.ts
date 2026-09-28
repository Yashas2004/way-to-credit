import type {
  AdminIssueSummary,
  AdminIssueThread,
  AdminListIssuesQuery,
  AdminListIssuesResponse,
  CreateIssueRequest,
  IssueEntry,
  IssueSummary,
  IssueThread,
  ListIssuesResponse,
} from "@way-to-credit/shared";
import { db } from "../../db/client.js";
import type { DbOrTx } from "../../db/types.js";
import { recordAudit } from "../../lib/audit.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { runLockedTransaction } from "../../lib/lockedTransaction.js";
import * as issuesRepo from "./issues.repo.js";

/*
 * Help-request status lifecycle
 * =============================
 *
 *   (new, by a user) ─────────────────────────► awaiting_admin
 *   user replies    (from any state) ─────────► awaiting_admin
 *   admin replies   (from any state) ─────────► awaiting_user
 *   admin resolves  (awaiting_*) ─────────────► resolved        (again: no-op)
 *   admin reopens   (resolved) ──► whichever side owes the next move:
 *                                  awaiting_admin if the last message was
 *                                  the user's, else awaiting_user
 *                                  (not resolved: no-op)
 *
 * A reply to a resolved request reopens it (that is what the sender means)
 * and records a "reopened" entry before the message. Resolves and reopens
 * are thread entries too, so the permanent record shows who did what, when.
 *
 * DELIBERATE: resolved requests stay resolved INDEFINITELY. There is no
 * auto-close and no "closed" state after any period, and nothing should
 * archive, expire or delete them — a request is a permanent record, and the
 * database forbids deleting it anyway (forbid_change(), migration 0006).
 * This is a product decision, not an oversight; don't add a cleanup job.
 *
 * DELIBERATE: only users raise requests; admins only respond. There is no
 * admin-to-admin thread. Enforced by requireRole("user") on the create
 * route (issues.routes.ts) and pinned by a test.
 *
 * Concurrency: every write takes the request row with SELECT … FOR UPDATE
 * inside runLockedTransaction (lock_timeout 3s → 409 RESOURCE_BUSY, CLAUDE.md
 * invariant 18) and decides the transition from the *locked* status, so two
 * admins replying at once, or a reply racing a resolve, serialise: nothing
 * is lost, every action lands in the thread in order, and the final status
 * follows the last committed action.
 */

const NOT_FOUND = "Help request not found.";
const INVALID_CURSOR_MESSAGE = "Invalid pagination cursor.";

type Actor = { type: "user"; id: string } | { type: "admin"; id: string };

// ---- mapping ------------------------------------------------------------------

type SummaryRow = NonNullable<Awaited<ReturnType<typeof issuesRepo.findForUser>>>;
type AdminSummaryRow = NonNullable<Awaited<ReturnType<typeof issuesRepo.findForAdmin>>>;
type EntryRow = Awaited<ReturnType<typeof issuesRepo.listEntries>>[number];

function toSummary(row: SummaryRow): IssueSummary {
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    openedAt: row.openedAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    unread: row.unread,
  };
}

function toAdminSummary(row: AdminSummaryRow): AdminIssueSummary {
  return {
    ...toSummary(row),
    raisedBy: row.raisedBy,
    raisedByUserId: row.raisedByUserId,
    raisedByDisplayName: row.raisedByDisplayName,
  };
}

function toEntry(row: EntryRow): IssueEntry {
  return {
    id: row.id,
    kind: row.kind,
    authorType: row.authorType,
    authorName: row.authorName,
    body: row.body,
    sentAt: row.sentAt.toISOString(),
  };
}

function encodeCursor(row: { lastActivityAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ lastActivityAt: row.lastActivityAt.toISOString(), id: row.id }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): issuesRepo.IssueKeysetCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  }
  if (typeof parsed !== "object" || parsed === null)
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  const { lastActivityAt, id } = parsed as Record<string, unknown>;
  if (typeof lastActivityAt !== "string" || typeof id !== "string") {
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  }
  const date = new Date(lastActivityAt);
  if (Number.isNaN(date.getTime())) throw new ValidationError(INVALID_CURSOR_MESSAGE);
  return { lastActivityAt: date, id };
}

function page<T extends { lastActivityAt: Date; id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

// ---- the transition, shared by every write --------------------------------------

/**
 * Appends `kind` (plus a "reopened" entry first, if a reply lands on a
 * resolved request) and applies the resulting status. The caller holds the
 * row lock on `issue`.
 */
async function appendAndTransition(
  tx: DbOrTx,
  issue: issuesRepo.IssueRow,
  actor: Actor,
  kind: issuesRepo.EntryKind,
  body: string,
): Promise<{ issue: issuesRepo.IssueRow; entryId: string }> {
  let reopening = false;
  if (kind === "message" && issue.status === "resolved") {
    await issuesRepo.insertEntry(tx, {
      issueId: issue.id,
      kind: "reopened",
      author: actor,
      body: "",
    });
    reopening = true;
  }
  // Read before inserting: an explicit reopen hands the request to whoever
  // wrote the last *message* (status events don't count).
  const lastMessageBy =
    kind === "reopened" ? await issuesRepo.lastMessageAuthorType(tx, issue.id) : undefined;
  const entry = await issuesRepo.insertEntry(tx, { issueId: issue.id, kind, author: actor, body });

  let status: issuesRepo.IssueStatusValue;
  let resolved: { at: Date; by: string } | null | undefined;
  if (kind === "message") {
    status = actor.type === "user" ? "awaiting_admin" : "awaiting_user";
    resolved = reopening ? null : undefined;
  } else if (kind === "resolved") {
    status = "resolved";
    resolved = { at: entry.sentAt, by: actor.id };
  } else {
    // Explicit reopen: the side that owes the next move.
    status = lastMessageBy === "admin" ? "awaiting_user" : "awaiting_admin";
    resolved = null;
  }

  const updated = await issuesRepo.applyIssueUpdate(tx, issue.id, {
    status,
    activityAt: entry.sentAt,
    authorType: actor.type,
    resolved,
    markAuthorRead: true,
  });
  if (actor.type === "admin") {
    await issuesRepo.markReadByAdmin(tx, issue.id, actor.id, entry.sentAt);
  }
  return { issue: updated, entryId: entry.id };
}

// ---- user ---------------------------------------------------------------------

export async function createIssue(userId: string, input: CreateIssueRequest): Promise<IssueThread> {
  const issueId = await db.transaction(async (tx) => {
    const issue = await issuesRepo.insertIssue(tx, userId, input.subject);
    await appendAndTransition(tx, issue, { type: "user", id: userId }, "message", input.body);
    return issue.id;
  });
  return getThreadForUser(userId, issueId);
}

export async function listForUser(
  userId: string,
  limit: number,
  cursor?: string,
): Promise<ListIssuesResponse> {
  const rows = await issuesRepo.listForUser(
    db,
    userId,
    limit + 1,
    cursor ? decodeCursor(cursor) : undefined,
  );
  const { items, nextCursor } = page(rows, limit);
  return { items: items.map(toSummary), nextCursor };
}

export async function getThreadForUser(userId: string, issueId: string): Promise<IssueThread> {
  const row = await issuesRepo.findForUser(db, issueId, userId);
  if (!row) throw new NotFoundError(NOT_FOUND); // someone else's request looks exactly like a missing one
  const entries = await issuesRepo.listEntries(db, issueId);
  return { issue: toSummary(row), entries: entries.map(toEntry) };
}

export async function replyAsUser(
  userId: string,
  issueId: string,
  body: string,
): Promise<IssueThread> {
  await runLockedTransaction(async (tx) => {
    const issue = await issuesRepo.lockIssue(tx, issueId, userId);
    if (!issue) throw new NotFoundError(NOT_FOUND);
    await appendAndTransition(tx, issue, { type: "user", id: userId }, "message", body);
  });
  return getThreadForUser(userId, issueId);
}

export async function markReadByUser(userId: string, issueId: string, upTo: Date): Promise<void> {
  const found = await issuesRepo.markReadByUser(db, issueId, userId, upTo);
  if (!found) throw new NotFoundError(NOT_FOUND);
}

export async function unreadCountForUser(userId: string): Promise<number> {
  return issuesRepo.countUnreadForUser(db, userId);
}

// ---- admin --------------------------------------------------------------------

function statusesFor(
  filter: AdminListIssuesQuery["status"],
): issuesRepo.IssueStatusValue[] | undefined {
  if (!filter) return undefined;
  return filter === "open" ? ["awaiting_admin", "awaiting_user"] : [filter];
}

export async function listForAdmin(
  adminId: string,
  query: AdminListIssuesQuery,
): Promise<AdminListIssuesResponse> {
  const rows = await issuesRepo.listForAdmin(
    db,
    adminId,
    { statuses: statusesFor(query.status), userId: query.userId },
    query.limit + 1,
    query.cursor ? decodeCursor(query.cursor) : undefined,
  );
  const { items, nextCursor } = page(rows, query.limit);
  return { items: items.map(toAdminSummary), nextCursor };
}

export async function getThreadForAdmin(
  adminId: string,
  issueId: string,
): Promise<AdminIssueThread> {
  const row = await issuesRepo.findForAdmin(db, issueId, adminId);
  if (!row) throw new NotFoundError(NOT_FOUND);
  const entries = await issuesRepo.listEntries(db, issueId);
  return { issue: toAdminSummary(row), entries: entries.map(toEntry) };
}

type AdminAction = "reply" | "resolve" | "reopen";

async function adminWrite(
  adminId: string,
  issueId: string,
  action: AdminAction,
  body = "",
): Promise<AdminIssueThread> {
  await runLockedTransaction(async (tx) => {
    const issue = await issuesRepo.lockIssue(tx, issueId);
    if (!issue) throw new NotFoundError(NOT_FOUND);

    // Idempotent: resolving a resolved request, or reopening an open one,
    // changes nothing and records nothing.
    if (action === "resolve" && issue.status === "resolved") return;
    if (action === "reopen" && issue.status !== "resolved") return;

    const kind: issuesRepo.EntryKind =
      action === "reply" ? "message" : action === "resolve" ? "resolved" : "reopened";
    const { issue: after, entryId } = await appendAndTransition(
      tx,
      issue,
      { type: "admin", id: adminId },
      kind,
      body,
    );
    await recordAudit(tx, {
      actorId: adminId,
      actorType: "admin",
      action: `issue_${action}`,
      entityType: "issues",
      entityId: issueId,
      before: { status: issue.status },
      after: { status: after.status, entryId },
    });
  });
  return getThreadForAdmin(adminId, issueId);
}

export function replyAsAdmin(
  adminId: string,
  issueId: string,
  body: string,
): Promise<AdminIssueThread> {
  return adminWrite(adminId, issueId, "reply", body);
}

export function resolveIssue(adminId: string, issueId: string): Promise<AdminIssueThread> {
  return adminWrite(adminId, issueId, "resolve");
}

export function reopenIssue(adminId: string, issueId: string): Promise<AdminIssueThread> {
  return adminWrite(adminId, issueId, "reopen");
}

export async function markReadByAdmin(adminId: string, issueId: string, upTo: Date): Promise<void> {
  const found = await issuesRepo.markReadByAdmin(db, issueId, adminId, upTo);
  if (!found) throw new NotFoundError(NOT_FOUND);
}

export async function unreadCountForAdmin(adminId: string): Promise<number> {
  return issuesRepo.countUnreadForAdmin(db, adminId);
}
