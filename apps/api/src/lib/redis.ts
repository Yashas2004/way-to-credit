import { Redis, type RedisOptions } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Every Redis call either answers quickly or fails quickly, so callers reach
 * their Postgres or in-process fallback in time (CLAUDE.md invariant 20).
 *
 * With ioredis's defaults a command issued while Redis was unreachable waited
 * in the offline queue until the queue was flushed: `connectTimeout` (10 s)
 * for each of `maxRetriesPerRequest + 1` attempts. Measured with Redis
 * blackholed, that was 20 s per command: a navigation load took 20-22 s and
 * a login 40-43 s (two sequential Redis calls). With the port refused it grew
 * from 0.4 s towards 2.7 s as the reconnect backoff lengthened.
 *
 * - `enableOfflineQueue: false`: while disconnected, a command is rejected at
 *   once instead of queued. Reconnecting carries on in the background.
 * - `commandTimeout`: a server that accepted the connection but has stopped
 *   answering can't hold a request either.
 * - `maxRetriesPerRequest: 0`: a command in flight when the connection drops
 *   fails rather than waiting to be replayed after a reconnect.
 *
 * The cost: without a queue nothing waits for the connection, so it must be
 * opened up front (`connectRedis()` at boot, and in the test setup). Until it
 * is ready, callers fall back just as they would with Redis down.
 */
export const REDIS_COMMAND_TIMEOUT_MS = 300;

export const REDIS_OPTIONS = {
  // Don't connect on import: scripts that never touch Redis (migrate, seed)
  // shouldn't open a connection. The server and tests call connectRedis().
  lazyConnect: true,
  enableOfflineQueue: false,
  commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
  maxRetriesPerRequest: 0,
  // Bounds each background connect attempt; no request waits on it.
  connectTimeout: 2_000,
} satisfies RedisOptions;

export const redis = new Redis(env.REDIS_URL, REDIS_OPTIONS);

// Without a listener, ioredis prints every failed reconnect attempt to stderr
// as an "Unhandled error event". Callers log their own fallbacks.
redis.on("error", () => {
  // Deliberately quiet here: see the callers' warnings.
});

/**
 * Opens the connection without ever throwing or blocking on an outage: if
 * Redis is down, this resolves false and ioredis keeps reconnecting in the
 * background while every caller falls through to its fallback.
 */
export async function connectRedis(): Promise<boolean> {
  if (redis.status !== "wait" && redis.status !== "end") return redis.status === "ready";
  try {
    await redis.connect();
    return true;
  } catch (error) {
    logger.warn({ err: error }, "Redis unreachable at startup; falling back until it returns");
    return false;
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    if (redis.status === "wait" || redis.status === "end") {
      await redis.connect();
    }
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

export function closeRedis(): Promise<void> {
  redis.disconnect();
  return Promise.resolve();
}
