import { and, eq, isNull } from "drizzle-orm";
import { activityLog, admins, sessions, users } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";
import type { Role } from "../../lib/jwt.js";

export async function findAdminByAdminId(db: DbOrTx, adminId: string) {
  const [admin] = await db.select().from(admins).where(eq(admins.adminId, adminId)).limit(1);
  return admin;
}

export async function findUserByUserId(db: DbOrTx, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
  return user;
}

export async function findAdminById(db: DbOrTx, id: string) {
  const [admin] = await db.select().from(admins).where(eq(admins.id, id)).limit(1);
  return admin;
}

export async function findUserById(db: DbOrTx, id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export async function findSessionByRefreshHash(db: DbOrTx, refreshTokenHash: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.refreshTokenHash, refreshTokenHash))
    .limit(1);
  return session;
}

export async function findSessionById(db: DbOrTx, id: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return session;
}

export interface NewSessionInput {
  id: string;
  familyId: string;
  role: Role;
  accountId: string;
  refreshTokenHash: string;
  lastUsedAt: Date;
  expiresAt: Date;
  ip: string | undefined;
  userAgent: string | undefined;
}

export async function insertSession(db: DbOrTx, input: NewSessionInput) {
  const [session] = await db
    .insert(sessions)
    .values({
      id: input.id,
      familyId: input.familyId,
      userId: input.role === "user" ? input.accountId : undefined,
      adminId: input.role === "admin" ? input.accountId : undefined,
      refreshTokenHash: input.refreshTokenHash,
      lastUsedAt: input.lastUsedAt,
      expiresAt: input.expiresAt,
      ip: input.ip,
      userAgent: input.userAgent,
    })
    .returning();

  if (!session) {
    throw new Error("Failed to insert session");
  }
  return session;
}

export async function revokeSession(db: DbOrTx, id: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)));
}

export async function revokeSessionFamily(db: DbOrTx, familyId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
}

export interface ActivityLogEntry {
  actorId: string;
  actorType: Role;
  event: "login" | "logout" | "forced_logout";
  ip: string | undefined;
  userAgent: string | undefined;
}

export async function logActivity(db: DbOrTx, entry: ActivityLogEntry): Promise<void> {
  await db.insert(activityLog).values(entry);
}
