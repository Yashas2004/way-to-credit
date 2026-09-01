import { uuidv7 } from "uuidv7";
import { db } from "../../db/client.js";
import type { DbOrTx } from "../../db/types.js";
import { recordAudit } from "../../lib/audit.js";
import { REFRESH_TOKEN_TTL_MS } from "../../lib/cookies.js";
import {
  AccountInactiveError,
  InvalidCredentialsError,
  InvalidOtpError,
  OutsideAccessWindowError,
  UnauthorizedError,
} from "../../lib/errors.js";
import { type Role, signAccessToken } from "../../lib/jwt.js";
import { issueOtp, verifyOtp } from "../../lib/otp.js";
import { hashPassword, verifyDummyPassword, verifyPassword } from "../../lib/password.js";
import { generateRefreshToken, hashRefreshToken } from "../../lib/refreshToken.js";
import { smsProvider } from "../../lib/sms/index.js";
import { isWithinUserAccessWindow, USER_ACCESS_WINDOW_DESCRIPTION } from "../../lib/time.js";
import { clearLoginAttempts, recordLoginFailure } from "../../middleware/rateLimit.js";
import * as authRepo from "./auth.repo.js";

const INVALID_OTP_MESSAGE = "Invalid or expired OTP.";

const SESSION_IDLE_TTL_MS = 12 * 60 * 60 * 1000;
const INVALID_CREDENTIALS_MESSAGE = "Incorrect identifier or password.";
const INVALID_SESSION_MESSAGE = "Invalid or expired session.";

export interface AuthIdentity {
  id: string;
  role: Role;
  identifier: string;
  displayName: string;
}

export interface AuthResult {
  identity: AuthIdentity;
  accessToken: string;
  refreshToken: string;
}

export interface RequestContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

interface Account {
  id: string;
  identifier: string;
  displayName: string;
}

async function issueSession(
  dbOrTx: DbOrTx,
  role: Role,
  account: Account,
  context: RequestContext,
  now: Date,
  existingFamilyId?: string,
): Promise<AuthResult> {
  const sessionId = uuidv7();
  const familyId = existingFamilyId ?? sessionId;
  const refreshToken = generateRefreshToken();

  await authRepo.insertSession(dbOrTx, {
    id: sessionId,
    familyId,
    role,
    accountId: account.id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    ip: context.ip,
    userAgent: context.userAgent,
  });

  const accessToken = await signAccessToken({ sub: account.id, role, sessionId });

  await authRepo.logActivity(dbOrTx, {
    actorId: account.id,
    actorType: role,
    event: "login",
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return {
    identity: {
      id: account.id,
      role,
      identifier: account.identifier,
      displayName: account.displayName,
    },
    accessToken,
    refreshToken,
  };
}

export async function login(
  input: { identifier: string; password: string },
  context: RequestContext,
  now: Date = new Date(),
): Promise<AuthResult> {
  const admin = await authRepo.findAdminByAdminId(db, input.identifier);

  if (admin) {
    const passwordOk = await verifyPassword(admin.passwordHash, input.password);
    if (!passwordOk) {
      await recordLoginFailure(input.identifier);
      throw new InvalidCredentialsError(INVALID_CREDENTIALS_MESSAGE);
    }
    await clearLoginAttempts(input.identifier);
    return issueSession(
      db,
      "admin",
      { id: admin.id, identifier: admin.adminId, displayName: admin.displayName },
      context,
      now,
    );
  }

  const user = await authRepo.findUserByUserId(db, input.identifier);

  if (user) {
    const passwordOk = await verifyPassword(user.passwordHash, input.password);
    if (!passwordOk) {
      await recordLoginFailure(input.identifier);
      throw new InvalidCredentialsError(INVALID_CREDENTIALS_MESSAGE);
    }
    if (!user.isActive) {
      // Same generic error as wrong-password — no enumeration signal for
      // "this identifier exists but is deactivated" at login time.
      await recordLoginFailure(input.identifier);
      throw new InvalidCredentialsError(INVALID_CREDENTIALS_MESSAGE);
    }

    await clearLoginAttempts(input.identifier);

    if (!isWithinUserAccessWindow(now)) {
      throw new OutsideAccessWindowError(
        `The portal is only available ${USER_ACCESS_WINDOW_DESCRIPTION}.`,
      );
    }

    return issueSession(
      db,
      "user",
      { id: user.id, identifier: user.userId, displayName: user.displayName },
      context,
      now,
    );
  }

  // No matching account: still perform a real argon2id verify (against a
  // hash generated with the same pinned parameters) so the response takes
  // about as long as a genuine wrong-password attempt.
  await verifyDummyPassword(input.password);
  await recordLoginFailure(input.identifier);
  throw new InvalidCredentialsError(INVALID_CREDENTIALS_MESSAGE);
}

export async function refresh(
  refreshTokenRaw: string,
  context: RequestContext,
  now: Date = new Date(),
): Promise<AuthResult> {
  const hash = hashRefreshToken(refreshTokenRaw);
  const session = await authRepo.findSessionByRefreshHash(db, hash);

  if (!session) {
    throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
  }

  if (session.revokedAt !== null) {
    // A revoked refresh token was replayed: theft. Revoke the whole family.
    const role: Role = session.userId ? "user" : "admin";
    const actorId = session.userId ?? session.adminId;
    await db.transaction(async (tx) => {
      await authRepo.revokeSessionFamily(tx, session.familyId);
      if (actorId) {
        await authRepo.logActivity(tx, {
          actorId,
          actorType: role,
          event: "forced_logout",
          ip: context.ip,
          userAgent: context.userAgent,
        });
      }
    });
    throw new UnauthorizedError("This session has been revoked.");
  }

  if (
    now.getTime() - session.lastUsedAt.getTime() > SESSION_IDLE_TTL_MS ||
    now.getTime() > session.expiresAt.getTime()
  ) {
    await authRepo.revokeSession(db, session.id);
    throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
  }

  const role: Role = session.userId ? "user" : "admin";
  const accountId = session.userId ?? session.adminId;
  if (!accountId) {
    await authRepo.revokeSession(db, session.id);
    throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
  }

  if (role === "user") {
    const user = await authRepo.findUserById(db, accountId);
    if (!user) {
      await authRepo.revokeSession(db, session.id);
      throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
    }
    if (!user.isActive) {
      await authRepo.revokeSession(db, session.id);
      throw new AccountInactiveError("This account has been deactivated.");
    }
    if (!isWithinUserAccessWindow(now)) {
      await authRepo.revokeSession(db, session.id);
      throw new OutsideAccessWindowError(
        `The portal is only available ${USER_ACCESS_WINDOW_DESCRIPTION}.`,
      );
    }

    return db.transaction(async (tx) => {
      await authRepo.revokeSession(tx, session.id);
      return issueSession(
        tx,
        "user",
        { id: user.id, identifier: user.userId, displayName: user.displayName },
        context,
        now,
        session.familyId,
      );
    });
  }

  const admin = await authRepo.findAdminById(db, accountId);
  if (!admin) {
    await authRepo.revokeSession(db, session.id);
    throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
  }

  return db.transaction(async (tx) => {
    await authRepo.revokeSession(tx, session.id);
    return issueSession(
      tx,
      "admin",
      { id: admin.id, identifier: admin.adminId, displayName: admin.displayName },
      context,
      now,
      session.familyId,
    );
  });
}

export async function logout(
  sessionId: string,
  actorId: string,
  role: Role,
  context: RequestContext,
): Promise<void> {
  await authRepo.revokeSession(db, sessionId);
  await authRepo.logActivity(db, {
    actorId,
    actorType: role,
    event: "logout",
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

export async function getIdentity(sub: string, role: Role): Promise<AuthIdentity> {
  if (role === "admin") {
    const admin = await authRepo.findAdminById(db, sub);
    if (!admin) {
      throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
    }
    return { id: admin.id, role, identifier: admin.adminId, displayName: admin.displayName };
  }

  const user = await authRepo.findUserById(db, sub);
  if (!user) {
    throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
  }
  return { id: user.id, role, identifier: user.userId, displayName: user.displayName };
}

/**
 * Verifies the current password, hashes the new one, and revokes every
 * OTHER active session for this admin while keeping the current one alive
 * — the one place in this app that needs "revoke all except this session,"
 * unlike the OTP reset flow below (no authenticated "current session" to
 * spare there). Logs `forced_logout` once for the action, matching the one
 * existing precedent (refresh-token-reuse detection revokes a whole
 * session family and logs once, not once per row).
 */
export async function changeAdminPassword(
  adminId: string,
  sessionId: string,
  input: { currentPassword: string; newPassword: string },
  context: RequestContext,
): Promise<void> {
  const admin = await authRepo.findAdminById(db, adminId);
  if (!admin) {
    throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
  }

  const passwordOk = await verifyPassword(admin.passwordHash, input.currentPassword);
  if (!passwordOk) {
    throw new InvalidCredentialsError("Incorrect current password.");
  }

  const newHash = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await authRepo.setAdminPasswordHash(tx, adminId, newHash);
    await authRepo.revokeOtherActiveSessionsForAdmin(tx, adminId, sessionId);
    await authRepo.logActivity(tx, {
      actorId: adminId,
      actorType: "admin",
      event: "forced_logout",
      ip: context.ip,
      userAgent: context.userAgent,
    });
    await recordAudit(tx, {
      actorId: adminId,
      actorType: "admin",
      action: "password_reset",
      entityType: "admins",
      entityId: adminId,
    });
  });
}

/**
 * Always resolves the same way regardless of whether `adminId` exists — no
 * enumeration. Known, deliberately-deferred residual timing signal: the
 * "exists" branch does real Redis + SMS-provider work the "doesn't exist"
 * branch skips entirely; see the TODO on `Msg91SmsProvider` for why this
 * isn't padded yet (the console provider that's actually live today has no
 * meaningful asymmetric latency to protect against).
 */
export async function forgotPassword(adminId: string): Promise<void> {
  const admin = await authRepo.findAdminByAdminId(db, adminId);
  if (!admin) {
    return;
  }

  const otp = await issueOtp(admin.id);
  await smsProvider.send(
    admin.mobileNumber,
    `Your Way-To-Credit password reset OTP is ${otp}. It expires in 5 minutes.`,
  );
}

/**
 * One generic `InvalidOtpError` covers every failure mode (admin doesn't
 * exist, wrong OTP, expired/never issued, too many attempts) — no oracle
 * for which one occurred. On success: new password, revoke EVERY session
 * for this admin (there's no authenticated "current session" here to
 * spare, unlike `changeAdminPassword`), reuse the existing `password_reset`
 * audit action.
 */
export async function resetPassword(
  adminId: string,
  otp: string,
  newPassword: string,
  context: RequestContext,
): Promise<void> {
  const admin = await authRepo.findAdminByAdminId(db, adminId);
  if (!admin) {
    throw new InvalidOtpError(INVALID_OTP_MESSAGE);
  }

  const result = await verifyOtp(admin.id, otp);
  if (result !== "ok") {
    throw new InvalidOtpError(INVALID_OTP_MESSAGE);
  }

  const newHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await authRepo.setAdminPasswordHash(tx, admin.id, newHash);
    await authRepo.revokeAllActiveSessionsForAdmin(tx, admin.id);
    await authRepo.logActivity(tx, {
      actorId: admin.id,
      actorType: "admin",
      event: "forced_logout",
      ip: context.ip,
      userAgent: context.userAgent,
    });
    await recordAudit(tx, {
      actorId: admin.id,
      actorType: "admin",
      action: "password_reset",
      entityType: "admins",
      entityId: admin.id,
    });
  });
}
