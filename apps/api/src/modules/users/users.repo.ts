import { and, asc, eq, isNull } from "drizzle-orm";
import { sessions, users } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";

// Explicit column selection everywhere — never fetch passwordHash for
// anything that could end up in a response.
const SAFE_COLUMNS = {
  id: users.id,
  userId: users.userId,
  displayName: users.displayName,
  creditPoints: users.creditPoints,
  isActive: users.isActive,
  lastSeenAt: users.lastSeenAt,
  createdAt: users.createdAt,
};

export interface CreateUserInput {
  userId: string;
  displayName: string;
  passwordHash: string;
  createdBy: string;
}

export async function createUser(db: DbOrTx, input: CreateUserInput) {
  const [row] = await db.insert(users).values(input).returning(SAFE_COLUMNS);
  if (!row) {
    throw new Error("Failed to create user");
  }
  return row;
}

export async function listUsers(db: DbOrTx) {
  return db.select(SAFE_COLUMNS).from(users).orderBy(asc(users.userId));
}

export async function findUserById(db: DbOrTx, id: string) {
  const [row] = await db.select(SAFE_COLUMNS).from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function setUserActive(db: DbOrTx, id: string, isActive: boolean) {
  const [row] = await db
    .update(users)
    .set({ isActive })
    .where(eq(users.id, id))
    .returning(SAFE_COLUMNS);
  return row;
}

export async function setUserPasswordHash(db: DbOrTx, id: string, passwordHash: string) {
  const [row] = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, id))
    .returning(SAFE_COLUMNS);
  return row;
}

/** Same guarded-update idiom as auth.repo.ts's session revocation. */
export async function revokeAllActiveSessionsForUser(db: DbOrTx, userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
