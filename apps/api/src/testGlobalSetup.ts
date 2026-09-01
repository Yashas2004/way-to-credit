import { redis } from "./lib/redis.js";

/**
 * Runs once before the whole test run (in its own isolated context, not
 * shared with test files). Flushes leftover rate-limit and cache keys from
 * previous runs so login-lockout state and stale tree caches never leak
 * across test invocations.
 */
export default async function setup(): Promise<void> {
  try {
    const keys = [...(await redis.keys("login:*")), ...(await redis.keys("tree:*"))];
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
}
