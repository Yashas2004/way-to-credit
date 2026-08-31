import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidPk } from "./columns.js";

export const milestones = pgTable("milestones", {
  id: uuidPk(),
  levelNumber: integer("level_number").notNull().unique(),
  pointsRequired: integer("points_required").notNull().unique(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
