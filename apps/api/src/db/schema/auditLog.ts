import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidPk } from "./columns.js";
import { actorTypeEnum } from "./enums.js";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuidPk(),
    actorId: uuid("actor_id").notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_entity_type_entity_id_occurred_at_idx").on(
      table.entityType,
      table.entityId,
      table.occurredAt.desc(),
    ),
  ],
);
