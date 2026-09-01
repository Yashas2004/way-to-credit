import { hash, verify } from "@node-rs/argon2";

// Pinned explicitly (not left to library defaults) so every hash in this app
// — real users and the timing-safety dummy below — is computed with exactly
// the same cost parameters. That's what makes an unknown-identifier login
// attempt's timing indistinguishable from a genuine wrong-password one: an
// argon2id verify's wall-clock cost is dominated by these parameters, not by
// the candidate password's content.
//
// `algorithm: 2` is `Algorithm.Argon2id` — the package declares that enum as
// `const enum`, which `isolatedModules` (required by this project's
// tsconfig) can't import across module boundaries, so the numeric value is
// pinned directly instead.
export const PASSWORD_HASH_OPTIONS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, PASSWORD_HASH_OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  return verify(hashed, password);
}

// Computed once at module load with the same pinned parameters as real user
// hashes. Never derived from user input, never logged.
const DUMMY_PASSWORD_HASH = await hash(
  "dummy-password-used-only-for-timing-safety",
  PASSWORD_HASH_OPTIONS,
);

/**
 * Used when a login identifier matches no account, so the response takes
 * about as long as a genuine wrong-password check — one real argon2id
 * verify either way — instead of returning near-instantly and leaking which
 * identifiers exist via timing.
 */
export async function verifyDummyPassword(password: string): Promise<boolean> {
  return verify(DUMMY_PASSWORD_HASH, password);
}
