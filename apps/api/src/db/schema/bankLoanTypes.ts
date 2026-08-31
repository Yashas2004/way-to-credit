import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { banks } from "./banks.js";
import { createdAt } from "./columns.js";
import { loanTypes } from "./loanTypes.js";

export const bankLoanTypes = pgTable(
  "bank_loan_types",
  {
    bankId: uuid("bank_id")
      .notNull()
      .references(() => banks.id, { onDelete: "restrict" }),
    loanTypeId: uuid("loan_type_id")
      .notNull()
      .references(() => loanTypes.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.bankId, table.loanTypeId] }),
    index("bank_loan_types_loan_type_id_idx").on(table.loanTypeId),
  ],
);
