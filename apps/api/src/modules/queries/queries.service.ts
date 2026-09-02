import type {
  AdminListQueriesQuery,
  AdminListQueriesResponse,
  AdminQueryRow,
  ListQueriesResponse,
  QueryRow,
  RaiseQueryRequest,
} from "@way-to-credit/shared";
import { db } from "../../db/client.js";
import { recordAudit } from "../../lib/audit.js";
import { AlreadyResolvedError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { runLockedTransaction } from "../../lib/lockedTransaction.js";
import * as banksRepo from "../banks/banks.repo.js";
import * as bankLoanTypesRepo from "../bankLoanTypes/bankLoanTypes.repo.js";
import { applyCreditAdjustment } from "../credits/credits.service.js";
import * as loanTypesRepo from "../loanTypes/loanTypes.repo.js";
import * as statusesRepo from "../statuses/statuses.repo.js";
import * as queriesRepo from "./queries.repo.js";

const ALREADY_RESOLVED_MESSAGE = "This query has already been resolved.";

const WITHDRAWN_MESSAGE = "This bank/loan-type/status combination is not available.";
const INVALID_CURSOR_MESSAGE = "Invalid pagination cursor.";

/**
 * Fresh, uncached validation (see stage decision #4) — four plain reads,
 * no row-locking (decision #5): each of `bankId`/`loanTypeId`/`statusId`
 * carries `ON DELETE RESTRICT`, so a hard delete is already impossible
 * while referenced, and a `queries` row is an intentional historical
 * snapshot, not a live-truth pointer, so a narrow soft-delete race here is
 * tolerated by design — that's what the snapshot columns are for.
 */
export async function raiseQuery(userId: string, input: RaiseQueryRequest): Promise<QueryRow> {
  const bank = await banksRepo.findBankById(db, input.bankId);
  if (!bank || bank.deletedAt) {
    throw new NotFoundError(WITHDRAWN_MESSAGE);
  }

  const loanType = await loanTypesRepo.findLoanTypeById(db, input.loanTypeId);
  if (!loanType || loanType.deletedAt) {
    throw new NotFoundError(WITHDRAWN_MESSAGE);
  }

  const status = await statusesRepo.findStatusById(db, input.statusId);
  if (!status || status.deletedAt) {
    throw new NotFoundError(WITHDRAWN_MESSAGE);
  }

  const pair = await bankLoanTypesRepo.findPair(db, input.bankId, input.loanTypeId);
  if (!pair) {
    throw new NotFoundError(WITHDRAWN_MESSAGE);
  }

  // raisedBy always comes from the authenticated caller, never from the
  // request body — RaiseQueryRequest has no `raisedBy` field at all.
  const row = await queriesRepo.insertQuery(db, {
    raisedBy: userId,
    bankId: input.bankId,
    loanTypeId: input.loanTypeId,
    statusId: input.statusId,
    bankNameSnapshot: bank.name,
    loanTypeNameSnapshot: loanType.name,
    statusNameSnapshot: status.name,
    message: input.message,
  });

  return toQueryRow(row);
}

function encodeCursor(row: { raisedAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ raisedAt: row.raisedAt.toISOString(), id: row.id })).toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): queriesRepo.QueryKeysetCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  }
  const { raisedAt, id } = parsed as Record<string, unknown>;
  if (typeof raisedAt !== "string" || typeof id !== "string") {
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  }

  const date = new Date(raisedAt);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  }

  return { raisedAt: date, id };
}

export async function listOwnQueries(
  userId: string,
  limit: number,
  cursorToken?: string,
): Promise<ListQueriesResponse> {
  const cursor = cursorToken ? decodeCursor(cursorToken) : undefined;

  // Fetch one extra row purely to decide whether a next page exists — it's
  // never returned to the client.
  const rows = await queriesRepo.listQueriesForUser(db, userId, limit + 1, cursor);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(toQueryRow),
    nextCursor: hasMore && lastRow ? encodeCursor(lastRow) : null,
  };
}

/** `resolvedBy` (an internal admin id) is deliberately omitted — see stage decision #8. */
function toQueryRow(row: queriesRepo.QueryRow): QueryRow {
  return {
    id: row.id,
    bankId: row.bankId,
    loanTypeId: row.loanTypeId,
    statusId: row.statusId,
    bankNameSnapshot: row.bankNameSnapshot,
    loanTypeNameSnapshot: row.loanTypeNameSnapshot,
    statusNameSnapshot: row.statusNameSnapshot,
    message: row.message,
    status: row.status,
    raisedAt: row.raisedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

/** Admin view — includes the raw `raisedBy`/`resolvedBy` ids the user-facing shape omits. */
function toAdminQueryRow(row: queriesRepo.QueryRow): AdminQueryRow {
  return {
    id: row.id,
    raisedBy: row.raisedBy,
    bankId: row.bankId,
    loanTypeId: row.loanTypeId,
    statusId: row.statusId,
    bankNameSnapshot: row.bankNameSnapshot,
    loanTypeNameSnapshot: row.loanTypeNameSnapshot,
    statusNameSnapshot: row.statusNameSnapshot,
    message: row.message,
    status: row.status,
    raisedAt: row.raisedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedBy: row.resolvedBy,
  };
}

/**
 * The central transaction — see the plan's pseudocode. A bare guarded
 * `UPDATE ... WHERE status='pending'` is the entire concurrency guard for
 * the query row (queries.repo.ts::updateQueryStatus); `applyCreditAdjustment`
 * separately takes `FOR UPDATE` on the user row, which is why this needs
 * `runLockedTransaction`'s `lock_timeout` protection.
 */
export async function approveQuery(actorId: string, queryId: string): Promise<AdminQueryRow> {
  return runLockedTransaction(async (tx) => {
    const updatedQuery = await queriesRepo.updateQueryStatus(tx, queryId, "approved", actorId);
    if (!updatedQuery) {
      throw new AlreadyResolvedError(ALREADY_RESOLVED_MESSAGE);
    }

    await applyCreditAdjustment(tx, updatedQuery.raisedBy, 1, "Query approved", queryId);

    await recordAudit(tx, {
      actorId,
      actorType: "admin",
      action: "approve",
      entityType: "queries",
      entityId: queryId,
      before: { status: "pending" },
      after: updatedQuery,
    });

    return toAdminQueryRow(updatedQuery);
  });
}

/**
 * Same guarded-UPDATE shape as approve, but no `FOR UPDATE` of its own —
 * still wrapped in `runLockedTransaction` so its `lock_timeout` applies
 * while this is the *waiting* side of a race against a concurrent approve
 * on the same row (there's no other bailout for a transaction that's only
 * waiting on someone else's lock, not holding one itself).
 */
export async function rejectQuery(actorId: string, queryId: string): Promise<AdminQueryRow> {
  return runLockedTransaction(async (tx) => {
    const updatedQuery = await queriesRepo.updateQueryStatus(tx, queryId, "rejected", actorId);
    if (!updatedQuery) {
      throw new AlreadyResolvedError(ALREADY_RESOLVED_MESSAGE);
    }

    await recordAudit(tx, {
      actorId,
      actorType: "admin",
      action: "reject",
      entityType: "queries",
      entityId: queryId,
      before: { status: "pending" },
      after: updatedQuery,
    });

    return toAdminQueryRow(updatedQuery);
  });
}

export async function getQueryById(id: string): Promise<AdminQueryRow> {
  const row = await queriesRepo.findQueryById(db, id);
  if (!row) {
    throw new NotFoundError("Query not found.");
  }
  return toAdminQueryRow(row);
}

export async function listQueriesForAdmin(
  query: AdminListQueriesQuery,
): Promise<AdminListQueriesResponse> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const filters: queriesRepo.AdminQueryFilters = {};
  if (query.status) filters.status = query.status;
  if (query.userId) filters.userId = query.userId;
  if (query.from) filters.from = new Date(query.from);
  if (query.to) filters.to = new Date(query.to);

  const rows = await queriesRepo.listQueriesForAdmin(
    db,
    filters,
    query.limit + 1,
    cursor,
    query.sort,
  );
  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(toAdminQueryRow),
    nextCursor: hasMore && lastRow ? encodeCursor(lastRow) : null,
  };
}
