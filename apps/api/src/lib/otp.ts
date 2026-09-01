import { createHash, randomInt } from "node:crypto";
import { redis } from "./redis.js";

// CLAUDE.md invariant #10: 6 digits, single-use, expire in 5 minutes, stored hashed in Redis.
const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;

function otpKey(adminInternalId: string): string {
  return `otp:${adminInternalId}`;
}
function otpAttemptsKey(adminInternalId: string): string {
  return `otp:attempts:${adminInternalId}`;
}

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

/** Generates, hashes, and stores a fresh OTP (5-min TTL), resetting any stale attempt counter. Returns the plaintext OTP to send. */
export async function issueOtp(adminInternalId: string): Promise<string> {
  const otp = generateOtp();
  await redis.set(otpKey(adminInternalId), hashOtp(otp), "EX", OTP_TTL_SECONDS);
  await redis.del(otpAttemptsKey(adminInternalId));
  return otp;
}

export type OtpVerifyResult = "ok" | "invalid" | "expired" | "too_many_attempts";

/**
 * Single-use: deletes the stored OTP (and attempt counter) on success, on
 * hitting the attempt cap, and never re-issues it. `"expired"` covers both
 * "never sent" and "TTL genuinely elapsed" — indistinguishable and meant to
 * be (no oracle for whether an OTP was ever issued).
 */
export async function verifyOtp(
  adminInternalId: string,
  candidate: string,
): Promise<OtpVerifyResult> {
  const storedHash = await redis.get(otpKey(adminInternalId));
  if (!storedHash) {
    return "expired";
  }

  const attempts = await redis.incr(otpAttemptsKey(adminInternalId));
  if (attempts === 1) {
    // The attempt counter must never outlive the OTP it's counting attempts against.
    await redis.expire(otpAttemptsKey(adminInternalId), OTP_TTL_SECONDS);
  }
  if (attempts > OTP_MAX_ATTEMPTS) {
    await redis.del(otpKey(adminInternalId), otpAttemptsKey(adminInternalId));
    return "too_many_attempts";
  }

  if (hashOtp(candidate) !== storedHash) {
    return "invalid";
  }

  await redis.del(otpKey(adminInternalId), otpAttemptsKey(adminInternalId));
  return "ok";
}
