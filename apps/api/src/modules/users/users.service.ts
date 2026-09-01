import { db } from "../../db/client.js";
import { recordAudit } from "../../lib/audit.js";
import { invalidateDescriptionTreeCache } from "../../lib/cache.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { isUniqueViolationError } from "../../lib/pgErrors.js";
import * as usersRepo from "./users.repo.js";

const ENTITY_TYPE = "users";

export interface AdminUserView {
  id: string;
  userId: string;
  displayName: string;
  creditPoints: number;
  isActive: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export interface CreateUserInput {
  userId: string;
  displayName: string;
  password: string;
}

export async function createUser(actorId: string, input: CreateUserInput): Promise<AdminUserView> {
  const passwordHash = await hashPassword(input.password);

  let user: AdminUserView;
  try {
    user = await db.transaction(async (tx) => {
      const row = await usersRepo.createUser(tx, {
        userId: input.userId,
        displayName: input.displayName,
        passwordHash,
        createdBy: actorId,
      });
      await recordAudit(tx, {
        actorId,
        actorType: "admin",
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: row.id,
        after: row, // SAFE_COLUMNS already excludes passwordHash; redaction in recordAudit is the second layer
      });
      return row;
    });
  } catch (error) {
    if (isUniqueViolationError(error)) {
      throw new ConflictError(`A user with id "${input.userId}" already exists.`);
    }
    throw error;
  }

  await invalidateDescriptionTreeCache();
  return user;
}

export async function listUsers(): Promise<AdminUserView[]> {
  return usersRepo.listUsers(db);
}

export async function deactivateUser(actorId: string, id: string): Promise<AdminUserView> {
  const after = await db.transaction(async (tx) => {
    const before = await usersRepo.findUserById(tx, id);
    if (!before) {
      throw new NotFoundError("User not found.");
    }

    const updated = await usersRepo.setUserActive(tx, id, false);
    if (!updated) {
      throw new NotFoundError("User not found.");
    }

    // Revoke sessions in the same transaction as the deactivation, so the
    // user is logged out immediately rather than at their next token
    // expiry — requireAuth already reloads the session fresh on every call,
    // so a revoked session is rejected on the user's very next request.
    await usersRepo.revokeAllActiveSessionsForUser(tx, id);

    await recordAudit(tx, {
      actorId,
      actorType: "admin",
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  });

  await invalidateDescriptionTreeCache();
  return after;
}

export async function reactivateUser(actorId: string, id: string): Promise<AdminUserView> {
  const after = await db.transaction(async (tx) => {
    const before = await usersRepo.findUserById(tx, id);
    if (!before) {
      throw new NotFoundError("User not found.");
    }

    const updated = await usersRepo.setUserActive(tx, id, true);
    if (!updated) {
      throw new NotFoundError("User not found.");
    }

    await recordAudit(tx, {
      actorId,
      actorType: "admin",
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  });

  await invalidateDescriptionTreeCache();
  return after;
}

export async function resetUserPassword(
  actorId: string,
  id: string,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    const before = await usersRepo.findUserById(tx, id);
    if (!before) {
      throw new NotFoundError("User not found.");
    }

    const updated = await usersRepo.setUserPasswordHash(tx, id, passwordHash);
    if (!updated) {
      throw new NotFoundError("User not found.");
    }

    // Never put password material (hash or plaintext) in the audit trail —
    // just record that a reset happened.
    await recordAudit(tx, {
      actorId,
      actorType: "admin",
      action: "password_reset",
      entityType: ENTITY_TYPE,
      entityId: id,
      before: { userId: before.userId },
      after: { userId: updated.userId },
    });
  });

  await invalidateDescriptionTreeCache();
}
