import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/**
 * Where the test suite keeps its data: its own Postgres database and its own
 * Redis database index, derived from the same settings the dev server uses,
 * so a test run never reads or writes dev data and a running dev server
 * can't disturb a test run. (Before this, both shared `way_to_credit` and
 * Redis index 0, and ten help-request tests once failed together while the
 * dev API was running.)
 *
 * - Database: the dev database's name plus `_test` (`way_to_credit_test`),
 *   on the same server and credentials.
 * - Redis: the same server, index 15 (14 if the dev server itself uses 15).
 *
 * Used by vitest.config.ts, to point every test worker at these before
 * config/env.ts loads (dotenv never overrides a variable that's already set),
 * and by testGlobalSetup.ts, which creates and tears them down. Deliberately
 * imports nothing from the app: app modules parse env at import time.
 */
export interface TestEnvironment {
  devDatabaseName: string;
  testDatabaseName: string;
  /** The test database's connection string. */
  databaseUrl: string;
  /** Same server, the `postgres` maintenance database: for CREATE/DROP DATABASE. */
  maintenanceUrl: string;
  devRedisIndex: number;
  testRedisIndex: number;
  /** The test Redis index's connection string. */
  redisUrl: string;
}

function readDotenv(): Record<string, string> {
  // apps/api/src -> repository root, where .env lives (absent in CI, which
  // sets the variables directly).
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const file = path.join(root, ".env");
  return existsSync(file) ? dotenv.parse(readFileSync(file, "utf8")) : {};
}

export function testEnvironment(): TestEnvironment {
  const fileValues = readDotenv();
  const devDatabaseUrl = process.env["DATABASE_URL"] ?? fileValues["DATABASE_URL"];
  const devRedisUrl = process.env["REDIS_URL"] ?? fileValues["REDIS_URL"];
  if (!devDatabaseUrl || !devRedisUrl) {
    throw new Error("Tests need DATABASE_URL and REDIS_URL (from .env or the environment).");
  }

  const db = new URL(devDatabaseUrl);
  const devDatabaseName = decodeURIComponent(db.pathname.replace(/^\//, ""));
  // Already pointed at a test database (a nested run): keep it.
  const testDatabaseName = devDatabaseName.endsWith("_test")
    ? devDatabaseName
    : `${devDatabaseName}_test`;
  const testDb = new URL(db);
  testDb.pathname = `/${testDatabaseName}`;
  const maintenance = new URL(db);
  maintenance.pathname = "/postgres";

  const redis = new URL(devRedisUrl);
  const devRedisIndex = Number(redis.pathname.replace(/^\//, "") || "0");
  const testRedisIndex = devRedisIndex === 15 ? 14 : 15;
  const testRedis = new URL(redis);
  testRedis.pathname = `/${String(testRedisIndex)}`;

  return {
    devDatabaseName,
    testDatabaseName,
    databaseUrl: testDb.toString(),
    maintenanceUrl: maintenance.toString(),
    devRedisIndex,
    testRedisIndex,
    redisUrl: testRedis.toString(),
  };
}

/**
 * Refuses anything that could touch dev data: the setup drops and recreates
 * this database and flushes this Redis index, so both must be the test ones.
 */
export function assertIsolated(t: TestEnvironment): void {
  if (!/^[a-z0-9_]+_test$/.test(t.testDatabaseName)) {
    throw new Error(
      `Refusing to use "${t.testDatabaseName}" as the test database: its name must end in _test.`,
    );
  }
  if (t.testDatabaseName === t.devDatabaseName && !t.devDatabaseName.endsWith("_test")) {
    throw new Error("Refusing to run tests against the dev database.");
  }
  if (t.testRedisIndex === t.devRedisIndex) {
    throw new Error(
      `Refusing to flush Redis index ${String(t.testRedisIndex)}: it's the dev index.`,
    );
  }
}
