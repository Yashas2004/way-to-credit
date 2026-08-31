import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("users_created_by_idx").on(table.createdBy)],
);
