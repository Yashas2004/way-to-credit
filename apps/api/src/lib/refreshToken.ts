import { createHash, randomBytes } from "node:crypto";

const REFRESH_TOKEN_BYTES = 32;

/** Opaque, high-entropy random token — the raw value is never stored, only its hash. */
export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
