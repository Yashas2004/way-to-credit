import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidPk } from "./columns.js";
import { milestones } from "./milestones.js";
import { users } from "./users.js";

export const userMilestones = pgTable(
  "user_milestones",
  {
    id: uuidPk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "restrict" }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("user_milestones_user_milestone_unique").on(table.userId, table.milestoneId),
    index("user_milestones_milestone_id_idx").on(table.milestoneId),
  ],
);
