import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidPk } from "./columns.js";

export const statuses = pgTable(
  "statuses",
  {
    id: uuidPk(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("statuses_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
