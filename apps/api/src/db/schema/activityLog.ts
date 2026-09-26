import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidPk } from "./columns.js";
import { activityEventEnum, actorTypeEnum } from "./enums.js";

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuidPk(),
    actorId: uuid("actor_id").notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    event: activityEventEnum("event").notNull(),
    // precision 3 (ms): the keyset cursor round-trips through a JS Date — see queries.raisedAt.
    occurredAt: timestamp("occurred_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("activity_log_actor_id_occurred_at_idx").on(table.actorId, table.occurredAt.desc()),
  ],
);
