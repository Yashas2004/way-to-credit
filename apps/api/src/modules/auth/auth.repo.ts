import { and, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
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

/**
 * Refresh-token reuse (theft) response: revokes every still-live row of the
 * family and stamps `compromisedAt` on *every* row, including ones already
 * rotated out, so the whole family keeps full-length retention as security
 * evidence. Existing revocation times are preserved.
 */
export async function revokeCompromisedSessionFamily(
  db: DbOrTx,
  familyId: string,
  at: Date,
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: sql`coalesce(${sessions.revokedAt}, ${at})`, compromisedAt: at })
    .where(eq(sessions.familyId, familyId));
}

/** Same guarded-update idiom as users.repo.ts's revokeAllActiveSessionsForUser, but for admins and unconditional (used by the OTP reset flow, which has no "current session" to spare). */
export async function revokeAllActiveSessionsForAdmin(db: DbOrTx, adminId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.adminId, adminId), isNull(sessions.revokedAt)));
}

/** Same as above, but excludes one session — used by admin self password-change to keep the current session alive while killing every other one. */
export async function revokeOtherActiveSessionsForAdmin(
  db: DbOrTx,
  adminId: string,
  exceptSessionId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.adminId, adminId),
        isNull(sessions.revokedAt),
        ne(sessions.id, exceptSessionId),
      ),
    );
}

export async function setAdminPasswordHash(
  db: DbOrTx,
  id: string,
  passwordHash: string,
): Promise<void> {
  await db.update(admins).set({ passwordHash }).where(eq(admins.id, id));
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

/**
 * The two retention rules' batch deletes (see sessionRetention.service.ts).
 * `FOR UPDATE SKIP LOCKED` makes concurrent callers — two API instances
 * running the job at once — take disjoint batches instead of blocking on,
 * or double-deleting, the same rows; it also means a row being marked
 * compromised at that instant is skipped, not deleted. Each call is one
 * short statement, so no lock is held across batches.
 */
async function deleteBatch(
  db: DbOrTx,
  where: SQL,
  orderBy: SQL,
  batchSize: number,
): Promise<number> {
  const batch = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(where)
    .orderBy(orderBy)
    .limit(batchSize)
    .for("update", { skipLocked: true });
  const deleted = await db
    .delete(sessions)
    .where(inArray(sessions.id, batch))
    .returning({ id: sessions.id });
  return deleted.length;
}

/** Superseded refresh rows — not a family's first row, family not compromised — whose token expired before `cutoff`. */
export function deleteSupersededRefreshRowsExpiredBefore(
  db: DbOrTx,
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  return deleteBatch(
    db,
    sql`${sessions.id} <> ${sessions.familyId} AND ${sessions.compromisedAt} IS NULL AND ${sessions.expiresAt} < ${cutoff}`,
    sql`${sessions.expiresAt}`,
    batchSize,
  );
}

/**
 * Everything else that ended before `cutoff`: a family's first row (the
 * login), and every row of a compromised family, measured from when the
 * family was marked compromised (every row in it had ended by then).
 */
export function deleteLongRetentionRowsEndedBefore(
  db: DbOrTx,
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  const endedAt = sql`coalesce(${sessions.revokedAt}, ${sessions.expiresAt})`;
  return deleteBatch(
    db,
    sql`${endedAt} < ${cutoff} AND (${sessions.compromisedAt} IS NULL OR ${sessions.compromisedAt} < ${cutoff})`,
    endedAt,
    batchSize,
  );
}
