import { connectRedis } from "./lib/redis.js";

// Runs before each test file. Redis commands don't queue while a connection
// is being opened (lib/redis.ts), so connect before any test issues one;
// otherwise a file's first Redis call would take the Redis-down fallback.
await connectRedis();
