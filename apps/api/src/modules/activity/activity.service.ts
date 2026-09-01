import type {
  ActiveSessionsResponse,
  ActivityLogQuery,
  ActivityLogResponse,
  StatsResponse,
} from "@way-to-credit/shared";
import { db } from "../../db/client.js";
import { ValidationError } from "../../lib/errors.js";
import * as activityRepo from "./activity.repo.js";

const INVALID_CURSOR_MESSAGE = "Invalid pagination cursor.";

function encodeCursor(row: { occurredAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ occurredAt: row.occurredAt.toISOString(), id: row.id }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): activityRepo.ActivityKeysetCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  }
  const { occurredAt, id } = parsed as Record<string, unknown>;
  if (typeof occurredAt !== "string" || typeof id !== "string") {
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  }

  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(INVALID_CURSOR_MESSAGE);
  }

  return { occurredAt: date, id };
}

export async function listActivity(query: ActivityLogQuery): Promise<ActivityLogResponse> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const filters: activityRepo.ActivityFilters = {};
  if (query.actorId) filters.actorId = query.actorId;
  if (query.from) filters.from = new Date(query.from);
  if (query.to) filters.to = new Date(query.to);

  const rows = await activityRepo.listActivity(db, filters, query.limit + 1, cursor);
  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorType: row.actorType,
      event: row.event,
      occurredAt: row.occurredAt.toISOString(),
      ip: row.ip,
      userAgent: row.userAgent,
    })),
    nextCursor: hasMore && lastRow ? encodeCursor(lastRow) : null,
  };
}

export async function listActiveSessions(): Promise<ActiveSessionsResponse> {
  const rows = await activityRepo.listActiveSessions(db);
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
  }));
}

export async function getStats(): Promise<StatsResponse> {
  return activityRepo.getStats(db);
}
