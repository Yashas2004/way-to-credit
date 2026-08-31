import { timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

export function uuidPk() {
  return uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());
}

export function createdAt() {
  return timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
}

export function updatedAt() {
  return timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
}
