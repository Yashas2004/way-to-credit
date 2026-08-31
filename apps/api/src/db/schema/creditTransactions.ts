import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidPk } from "./columns.js";
import { queries } from "./queries.js";
import { users } from "./users.js";

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuidPk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    queryId: uuid("query_id").references(() => queries.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("credit_transactions_user_id_idx").on(table.userId),
    index("credit_transactions_query_id_idx").on(table.queryId),
  ],
);
