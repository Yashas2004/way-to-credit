import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidPk } from "./columns.js";

export const loanTypes = pgTable(
  "loan_types",
  {
    id: uuidPk(),
    name: text("name").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("loan_types_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
