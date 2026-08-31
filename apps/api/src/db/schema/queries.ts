import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { admins } from "./admins.js";
import { banks } from "./banks.js";
import { uuidPk } from "./columns.js";
import { queryStatusEnum } from "./enums.js";
import { loanTypes } from "./loanTypes.js";
import { statuses } from "./statuses.js";
import { users } from "./users.js";

export const queries = pgTable(
  "queries",
  {
    id: uuidPk(),
    raisedBy: uuid("raised_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    bankId: uuid("bank_id")
      .notNull()
      .references(() => banks.id, { onDelete: "restrict" }),
    loanTypeId: uuid("loan_type_id")
      .notNull()
      .references(() => loanTypes.id, { onDelete: "restrict" }),
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "restrict" }),
    bankNameSnapshot: text("bank_name_snapshot").notNull(),
    loanTypeNameSnapshot: text("loan_type_name_snapshot").notNull(),
    statusNameSnapshot: text("status_name_snapshot").notNull(),
    message: text("message").notNull(),
    status: queryStatusEnum("status").notNull().default("pending"),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => admins.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("queries_raised_by_idx").on(table.raisedBy),
    index("queries_bank_id_idx").on(table.bankId),
    index("queries_loan_type_id_idx").on(table.loanTypeId),
    index("queries_status_id_idx").on(table.statusId),
    index("queries_resolved_by_idx").on(table.resolvedBy),
    index("queries_status_raised_at_idx").on(table.status, table.raisedAt.desc()),
    index("queries_raised_by_raised_at_idx").on(table.raisedBy, table.raisedAt.desc()),
  ],
);
