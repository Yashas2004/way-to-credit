import { pgEnum } from "drizzle-orm/pg-core";

export const queryStatusEnum = pgEnum("query_status", ["pending", "approved", "rejected"]);

export const actorTypeEnum = pgEnum("actor_type", ["admin", "user"]);

export const activityEventEnum = pgEnum("activity_event", ["login", "logout", "forced_logout"]);

/**
 * Help-request lifecycle. Deliberately three states, no "open" (a new
 * request is always awaiting an admin) and no "closed": resolved is the only
 * terminal state, it lasts indefinitely, and any reply reopens it. There is
 * no auto-close after any period, by design — see issues.service.ts before
 * adding a cleanup job.
 */
export const issueStatusEnum = pgEnum("issue_status", [
  "awaiting_admin",
  "awaiting_user",
  "resolved",
]);

/** A thread entry is a message, or a status event recorded in the thread. */
export const issueEntryKindEnum = pgEnum("issue_entry_kind", ["message", "resolved", "reopened"]);
