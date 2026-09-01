import type { CookieOptions, Response } from "express";
import { ACCESS_TOKEN_TTL_SECONDS } from "./jwt.js";

export const ACCESS_TOKEN_COOKIE_NAME = "access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "refresh_token";
const REFRESH_TOKEN_PATH = "/api/auth";

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Secure is unconditional, not conditioned on NODE_ENV: modern browsers treat
// http://localhost as a secure context, so local dev still receives these
// cookies. There is no environment where this app should ever send them
// over a connection the browser doesn't consider secure.
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
};

export function setAccessTokenCookie(res: Response, token: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, token, {
    ...baseCookieOptions,
    path: "/",
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
}

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, {
    ...baseCookieOptions,
    path: REFRESH_TOKEN_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

/** A cookie can only be cleared by a Set-Cookie matching its original Path. */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, { ...baseCookieOptions, path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { ...baseCookieOptions, path: REFRESH_TOKEN_PATH });
}
