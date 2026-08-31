import { pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, updatedAt, uuidPk } from "./columns.js";

export const admins = pgTable("admins", {
  id: uuidPk(),
  adminId: text("admin_id").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  mobileNumber: text("mobile_number").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
