import type {
  AdjustCreditsResponse,
  MarkMilestoneSeenResponse,
  MyCreditsResponse,
} from "@way-to-credit/shared";
import type { DbOrTx } from "../../db/types.js";
import { db } from "../../db/client.js";
import { recordAudit } from "../../lib/audit.js";
import { ConflictError, NotFoundError, ServiceUnavailableError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { runLockedTransaction } from "../../lib/lockedTransaction.js";
import { redis } from "../../lib/redis.js";
import * as creditsRepo from "./credits.repo.js";

/**
 * Read-only this stage — no credit-awarding logic here. `creditPoints ===
 * undefined` can't happen in practice (requireAuth already re-loaded this
 * exact user row this request), but is guarded defensively rather than
 * assumed.
 */
export async function getMyCredits(userId: string): Promise<MyCreditsResponse> {
  const creditPoints = await creditsRepo.findUserCreditPoints(db, userId);
  if (creditPoints === undefined) {
    throw new NotFoundError("User not found.");
  }

  const milestoneRows = await creditsRepo.listUnlockedMilestonesForUser(db, userId);

  return {
    creditPoints,
    milestones: milestoneRows.map((row) => ({
      milestoneId: row.milestoneId,
      levelNumber: row.levelNumber,
      pointsRequired: row.pointsRequired,
      title: row.title,
      message: row.message,
      unlockedAt: row.unlockedAt.toISOString(),
    })),
  };
}

export interface CreditAdjustmentResult {
  creditTransactionId: string;
  creditPoints: number;
  newlyUnlockedMilestones: { id: string; levelNumber: number; title: string }[];
}

/**
 * The one shared core both `approveQuery` (delta=+1, queryId set) and
 * `adjustUserCredits` (admin-supplied delta, queryId=null) call — locks the
 * user row, guards against going below zero, writes the ledger row, applies
 * the delta, and computes newly-crossed milestones. Must be called from
 * within an already-open transaction (never opens its own) — the caller is
 * responsible for `runLockedTransaction`, since this function's `FOR
 * UPDATE` is exactly what CLAUDE.md invariant #18's `lock_timeout`
 * requirement is protecting.
 */
export async function applyCreditAdjustment(
  tx: DbOrTx,
  userId: string,
  delta: number,
  reason: string,
  queryId: string | null,
): Promise<CreditAdjustmentResult> {
  const lockedUser = await creditsRepo.findUserByIdForUpdate(tx, userId);
  if (!lockedUser) {
    throw new NotFoundError("User not found.");
  }

  const newTotal = lockedUser.creditPoints + delta;
  if (newTotal < 0) {
    throw new ConflictError(
      `This adjustment would take credits below zero (current: ${String(lockedUser.creditPoints)}, delta: ${String(delta)}).`,
    );
  }

  const creditTxRow = await creditsRepo.insertCreditTransaction(tx, {
    userId,
    delta,
    reason,
    queryId,
  });
  const updatedUser = await creditsRepo.incrementUserCreditPoints(tx, userId, delta);

  // Milestone-eligibility TOCTOU: the SELECT (inside unlockEligibleMilestones)
  // and its INSERT are a few statements apart under READ COMMITTED, with no
  // lock on the milestones being read. A concurrent admin edit landing in
  // that gap could in theory drop a milestone out of eligibility between
  // the two — accepted, not mitigated: the read side already ignores
  // `isActive` (see credits.repo.ts's listUnlockedMilestonesForUser), so a
  // stale-but-unlocked milestone displays identically to any other; a
  // missed unlock self-heals on this user's next credit event, since
  // eligibility is recomputed from scratch every time.
  const newlyUnlocked = await creditsRepo.unlockEligibleMilestones(
    tx,
    userId,
    updatedUser.creditPoints,
  );

  return {
    creditTransactionId: creditTxRow.id,
    creditPoints: updatedUser.creditPoints,
    newlyUnlockedMilestones: newlyUnlocked.map((m) => ({
      id: m.id,
      levelNumber: m.levelNumber,
      title: m.title,
    })),
  };
}

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const IDEMPOTENCY_PENDING_SENTINEL = "PENDING";

function idempotencyRedisKey(key: string): string {
  return `idempotency:credit-adjustment:${key}`;
}

/**
 * Manual admin credit adjustment. Requires a client-generated
 * `idempotencyKey` (validated as a UUID at the route layer) — see the plan's
 * decision on why: a financial ledger can't rely on client-side
 * disable-on-submit alone. Reserve-then-resolve against Redis, atomically:
 * `SET NX` reserves the key before any DB work happens, so two genuinely
 * concurrent requests with the same key can't both slip past the check and
 * both write a ledger row.
 */
export async function adjustUserCredits(
  actorId: string,
  userId: string,
  delta: number,
  reason: string,
  idempotencyKey: string,
): Promise<AdjustCreditsResponse> {
  const redisKey = idempotencyRedisKey(idempotencyKey);

  let reserved: string | null;
  try {
    reserved = await redis.set(
      redisKey,
      IDEMPOTENCY_PENDING_SENTINEL,
      "EX",
      IDEMPOTENCY_TTL_SECONDS,
      "NX",
    );
  } catch {
    // Fail closed: can't verify this key hasn't already been used, so don't
    // risk creating a duplicate ledger entry. Unlike login/query-raise rate
    // limits, this is deliberately NOT a fail-open path — a brief inability
    // to issue manual adjustments is not an outage; a duplicate ledger
    // entry is worse than a retry.
    throw new ServiceUnavailableError(
      "Credit adjustments are temporarily unavailable. Please try again.",
    );
  }

  if (reserved === null) {
    // Key already exists — either a completed result or a concurrent
    // in-flight request holding the same reservation.
    let existing: string | null;
    try {
      existing = await redis.get(redisKey);
    } catch {
      throw new ServiceUnavailableError(
        "Credit adjustments are temporarily unavailable. Please try again.",
      );
    }
    if (existing === null || existing === IDEMPOTENCY_PENDING_SENTINEL) {
      throw new ConflictError(
        "A request with this idempotency key is already being processed. Please retry shortly.",
      );
    }
    return JSON.parse(existing) as AdjustCreditsResponse;
  }

  let responseBody: AdjustCreditsResponse;
  try {
    responseBody = await runLockedTransaction(async (tx) => {
      const result = await applyCreditAdjustment(tx, userId, delta, reason, null);

      // Richer audit payload than approve/reject get — see the plan's
      // decision: the delta/reason here ARE an admin's entire unilateral
      // judgment call, with no other durable record of "why," and
      // credit_transactions/user_milestones aren't append-only-protected
      // the way audit_log is (CLAUDE.md invariant #15 scopes that
      // protection to audit_log specifically).
      await recordAudit(tx, {
        actorId,
        actorType: "admin",
        action: "credit_adjustment",
        entityType: "users",
        entityId: userId,
        after: { delta, reason, resultingCreditPoints: result.creditPoints },
      });

      return {
        userId,
        creditPoints: result.creditPoints,
        newlyUnlockedMilestones: result.newlyUnlockedMilestones.map((m) => ({
          milestoneId: m.id,
          levelNumber: m.levelNumber,
          title: m.title,
        })),
      };
    });
  } catch (error) {
    // Release the reservation on failure so a legitimate retry with the
    // same key isn't stuck behind a dead "PENDING" sentinel until the 24h
    // TTL expires.
    try {
      await redis.del(redisKey);
    } catch {
      // best-effort — the original error is what matters here
    }
    throw error;
  }

  try {
    await redis.set(redisKey, JSON.stringify(responseBody), "EX", IDEMPOTENCY_TTL_SECONDS);
  } catch (error) {
    // The DB transaction already committed successfully by this point —
    // failing the response now would tell the client the operation failed
    // when it didn't, which is more likely to CAUSE a genuine duplicate via
    // a well-intentioned retry than to prevent one. Log and still return
    // success; the narrow residual gap (a retry with this exact key,
    // arriving after specifically this failure, won't be recognized as a
    // duplicate) is accepted, not solved — that would need a cross-system
    // transaction, out of scope here.
    logger.warn(
      { err: error, idempotencyKey },
      "Failed to persist idempotency record after a successful credit adjustment",
    );
  }

  return responseBody;
}

export async function markMilestoneSeen(
  userId: string,
  milestoneId: string,
): Promise<MarkMilestoneSeenResponse> {
  const row = await creditsRepo.findUserMilestoneRow(db, userId, milestoneId);
  if (!row) {
    throw new NotFoundError("You have not unlocked this milestone.");
  }
  if (!row.seenAt) {
    await creditsRepo.markUserMilestoneSeen(db, userId, milestoneId);
  }
  return { status: "ok" };
}
