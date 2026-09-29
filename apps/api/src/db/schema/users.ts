import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { admins } from "./admins.js";
import { createdAt, updatedAt, uuidPk } from "./columns.js";

export const users = pgTable(
  "users",
  {
    id: uuidPk(),
    userId: text("user_id").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    creditPoints: integer("credit_points").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => admins.id, { onDelete: "restrict" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    // Archived = "this person has left"; distinct from is_active = false
    // ("temporarily blocked"). Archiving implies deactivation (the CHECK
    // below makes that impossible to violate); unarchiving leaves the user
    // deactivated. Nothing is ever deleted: all history stays attached.
    archivedAt: timestamp("archived_at", { withTimezone: true, precision: 3 }),
    archivedBy: uuid("archived_by").references(() => admins.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("users_created_by_idx").on(table.createdBy),
    index("users_archived_by_idx").on(table.archivedBy),
    check(
      "users_archived_implies_inactive",
      sql`${table.archivedAt} IS NULL OR ${table.isActive} = false`,
    ),
  ],
);
