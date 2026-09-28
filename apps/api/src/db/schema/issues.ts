import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { admins } from "./admins.js";
import { uuidPk } from "./columns.js";
import { issueStatusEnum } from "./enums.js";
import { users } from "./users.js";

// Every timestamp here is compared, sorted, or carried in a cursor, so all
// are precision 3 (ms), matching what a JS Date can hold — the lesson of
// migration 0002. At µs precision a page boundary skips or repeats rows and
// a read marker never quite equals the message it marks.
const ms = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });

/**
 * A help request. Never deleted (a database trigger forbids it, migration
 * 0006); only its status changes. The denormalised `last_*` columns are
 * written in the same locked transaction as each thread entry, so lists and
 * unread counts never aggregate over messages.
 */
export const issues = pgTable(
  "issues",
  {
    id: uuidPk(),
    raisedBy: uuid("raised_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subject: text("subject").notNull(),
    status: issueStatusEnum("status").notNull().default("awaiting_admin"),
    openedAt: ms("opened_at").notNull().defaultNow(),
    // Only ever moves forward (GREATEST), so keyset pages can't repeat a row.
    lastActivityAt: ms("last_activity_at").notNull().defaultNow(),
    lastUserMessageAt: ms("last_user_message_at"),
    lastAdminMessageAt: ms("last_admin_message_at"),
    // The raiser's read marker — only they can see the request, so one column.
    userLastReadAt: ms("user_last_read_at"),
    // The *current* resolution; null while open. The full history of
    // resolves and reopens is in the thread (issue_messages events).
    resolvedAt: ms("resolved_at"),
    resolvedBy: uuid("resolved_by").references(() => admins.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("issues_raised_by_activity_idx").on(
      table.raisedBy,
      table.lastActivityAt.desc(),
      table.id.desc(),
    ),
    index("issues_status_activity_idx").on(
      table.status,
      table.lastActivityAt.desc(),
      table.id.desc(),
    ),
    index("issues_activity_idx").on(table.lastActivityAt.desc(), table.id.desc()),
    index("issues_resolved_by_idx").on(table.resolvedBy),
  ],
);
