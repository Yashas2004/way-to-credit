import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { admins } from "./admins.js";
import { uuidPk } from "./columns.js";
import { actorTypeEnum, issueEntryKindEnum } from "./enums.js";
import { issues } from "./issues.js";
import { users } from "./users.js";

/**
 * The thread: messages and status events, append-only. A database trigger
 * (migration 0006) rejects every UPDATE, DELETE and TRUNCATE — a sent
 * message is part of the record, and a correction is a new message.
 */
export const issueMessages = pgTable(
  "issue_messages",
  {
    id: uuidPk(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "restrict" }),
    kind: issueEntryKindEnum("kind").notNull().default("message"),
    authorType: actorTypeEnum("author_type").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "restrict" }),
    authorAdminId: uuid("author_admin_id").references(() => admins.id, { onDelete: "restrict" }),
    // 1-5000 characters for a message (validated in packages/shared); empty
    // for a status event.
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    index("issue_messages_issue_sent_idx").on(table.issueId, table.sentAt, table.id),
    check(
      "issue_messages_author_xor_check",
      sql`(${table.authorUserId} IS NOT NULL) <> (${table.authorAdminId} IS NOT NULL)`,
    ),
    check(
      "issue_messages_author_type_check",
      sql`(${table.authorType} = 'user') = (${table.authorUserId} IS NOT NULL)`,
    ),
    check(
      "issue_messages_body_check",
      sql`(${table.kind} = 'message') = (length(${table.body}) > 0)`,
    ),
  ],
);
