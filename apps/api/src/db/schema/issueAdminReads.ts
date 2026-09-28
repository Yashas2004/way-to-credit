import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { admins } from "./admins.js";
import { issues } from "./issues.js";

/**
 * Per-admin read marker: "this admin has read the thread up to here". One
 * row per admin per request they've opened, not one per message — the
 * thread is append-only and ordered, so a watermark is exact.
 */
export const issueAdminReads = pgTable(
  "issue_admin_reads",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "restrict" }),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "restrict" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.issueId, table.adminId] })],
);
