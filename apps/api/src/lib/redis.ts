import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

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
