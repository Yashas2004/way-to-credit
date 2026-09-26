import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { admins } from "./admins.js";
import { uuidPk } from "./columns.js";
import { users } from "./users.js";

export const sessions = pgTable(
  "sessions",
  {
    id: uuidPk(),
    familyId: uuid("family_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    adminId: uuid("admin_id").references(() => admins.id, { onDelete: "restrict" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_admin_id_idx").on(table.adminId),
    index("sessions_family_id_idx").on(table.familyId),
    uniqueIndex("sessions_refresh_token_hash_unique").on(table.refreshTokenHash),
    // When a session stopped being usable: revoked, or else expired. The
    // retention job deletes by this expression (sessionRetention.service.ts),
    // so it's indexed as exactly that expression.
    index("sessions_ended_at_idx").on(sql`coalesce(${table.revokedAt}, ${table.expiresAt})`),
    // The admin "active sessions" list: live user sessions only. Partial, so
    // it stays a few hundred entries however many ended sessions are retained.
    index("sessions_active_user_expires_idx")
      .on(table.expiresAt)
      .where(sql`${table.revokedAt} IS NULL AND ${table.userId} IS NOT NULL`),
    check(
      "sessions_actor_xor_check",
      sql`(${table.userId} IS NOT NULL) <> (${table.adminId} IS NOT NULL)`,
    ),
  ],
);
