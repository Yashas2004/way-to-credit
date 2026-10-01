import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Redis } from "ioredis";
import pg from "pg";
import { assertIsolated, testEnvironment, type TestEnvironment } from "./testEnvironment.js";

/**
 * Runs once around the whole test run, in its own context (not a test
 * worker). Gives the suite a fresh database and Redis index of its own
 * (testEnvironment.ts), so tests never touch dev data and a running dev
 * server can't interfere:
 *
 * - drops and recreates the test database, then applies the real
 *   migrations (the same files `pnpm db:migrate` applies; never seeded:
 *   tests create their own state, as in CI);
 * - flushes the test Redis index;
 * - afterwards drops the database and flushes the index again.
 *
 * Imports nothing from the app: app modules parse env at import time, and
 * here the dev settings are still in play. Workers get the test settings
 * from vitest.config.ts.
 */
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

async function onMaintenanceDb(t: TestEnvironment, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: t.maintenanceUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function flushTestRedis(t: TestEnvironment): Promise<void> {
  const redis = new Redis(t.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0 });
  try {
    await redis.connect();
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  const t = testEnvironment();
  assertIsolated(t);
  // The name is checked against /^[a-z0-9_]+_test$/ above, so quoting it is safe.
  const name = `"${t.testDatabaseName}"`;

  // FORCE: a previous run killed mid-way can leave connections open.
  await onMaintenanceDb(t, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await onMaintenanceDb(t, `CREATE DATABASE ${name}`);

  const pool = new pg.Pool({ connectionString: t.databaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
  await flushTestRedis(t);

  return async function teardown() {
    await onMaintenanceDb(t, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await flushTestRedis(t);
  };
}
