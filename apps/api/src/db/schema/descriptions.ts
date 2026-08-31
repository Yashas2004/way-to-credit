import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { admins } from "./admins.js";
import { banks } from "./banks.js";
import { updatedAt, uuidPk } from "./columns.js";
import { loanTypes } from "./loanTypes.js";
import { statuses } from "./statuses.js";

export const descriptions = pgTable(
  "descriptions",
  {
    id: uuidPk(),
    bankId: uuid("bank_id")
      .notNull()
      .references(() => banks.id, { onDelete: "restrict" }),
    loanTypeId: uuid("loan_type_id")
      .notNull()
      .references(() => loanTypes.id, { onDelete: "restrict" }),
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "restrict" }),
    body: text("body").notNull().default("NA"),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => admins.id, { onDelete: "restrict" }),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("descriptions_bank_loan_status_unique").on(
      table.bankId,
      table.loanTypeId,
      table.statusId,
    ),
    index("descriptions_loan_type_id_idx").on(table.loanTypeId),
    index("descriptions_status_id_idx").on(table.statusId),
    index("descriptions_updated_by_idx").on(table.updatedBy),
  ],
);
