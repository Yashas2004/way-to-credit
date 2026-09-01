import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env.js";

const secretKey = new TextEncoder().encode(env.JWT_SECRET);

export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;

export type Role = "admin" | "user";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  sessionId: string;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role, sessionId: payload.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${String(ACCESS_TOKEN_TTL_SECONDS)}s`)
    .sign(secretKey);
}

/** Returns null for any invalid, expired, malformed, or wrong-shape token — never throws. */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);

    const sub = payload.sub;
    const role = payload["role"];
    const sessionId = payload["sessionId"];

    if (
      typeof sub !== "string" ||
      (role !== "admin" && role !== "user") ||
      typeof sessionId !== "string"
    ) {
      return null;
    }

    return { sub, role, sessionId };
  } catch {
    return null;
  }
}
