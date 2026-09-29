import { db } from "../db/client.js";
import { buildWorkspaceNav, type WorkspaceNav } from "./workspaceNav.js";
import { logger } from "./logger.js";
import { uuidv7 } from "uuidv7";
import { redis } from "./redis.js";

// Version-pointer + versioned-data-key scheme (not one literal Redis key):
// `nav:version` holds an opaque version token; the payload lives at
// `nav:v<token>`. Invalidation only ever replaces the token, never DELs a
// data key — so a slow concurrent reader that already read the old token
// can only ever repopulate the now-abandoned old key, never clobber the new
// one. Versioned data keys carry a short TTL so abandoned ones self-clean.
//
// Tokens are fresh UUIDs, never a counter. A counter broke whenever
// the version key went missing (fresh Redis, restart without persistence,
// eviction, a flush): readers defaulted to 1 and cached under the `v1` key,
// then the next admin write's INCR created the key at 1 — the same version
// — so that write's invalidation was silently lost and users saw stale
// dropdowns for up to the TTL. A fresh token can't collide with any cached key.
const VERSION_KEY = "nav:version";
const NAV_KEY_PREFIX = "nav:v";
const NAV_TTL_SECONDS = 5 * 60;

async function getCurrentVersion(): Promise<string> {
  const existing = await redis.get(VERSION_KEY);
  if (existing) return existing;
  // Missing: create one atomically. NX so concurrent readers (or a write
  // racing them) agree on whichever token landed first; read it back.
  await redis.set(VERSION_KEY, uuidv7(), "NX");
  return (await redis.get(VERSION_KEY)) ?? uuidv7();
}

/** Called by every mutating admin route, after its transaction commits (CLAUDE.md invariant 19). */
export async function invalidateWorkspaceCache(): Promise<void> {
  try {
    await redis.set(VERSION_KEY, uuidv7());
  } catch (error) {
    logger.warn(
      { err: error },
      "Redis unavailable; could not invalidate the workspace navigation cache",
    );
  }
}

/**
 * The parsed navigation data for the version this instance last saw. Every
 * request still reads the (tiny) version token from Redis, so an admin write
 * on any instance invalidates this on every instance at the next request —
 * CLAUDE.md invariant 19. What it saves is fetching and parsing the payload
 * on every Workspace load. Deep-frozen because
 * it's shared across requests: a caller mutating it throws, loudly, instead
 * of corrupting everyone else's view. Never used on the Redis-down path —
 * without a version there's no way to know it's current.
 */
let memo: { version: string; nav: WorkspaceNav } | null = null;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function remember(version: string, nav: WorkspaceNav): WorkspaceNav {
  const frozen = deepFreeze(nav);
  memo = { version, nav: frozen };
  return frozen;
}

/**
 * Single-flight: concurrent misses for the same version share one rebuild
 * instead of each running their own. Measured before this existed: 300
 * concurrent misses ran 300 rebuilds and starved the 10-connection pool
 * for ~5s, so every other request (each auth check is 2 queries) waited
 * too. Per instance — N instances rebuild at most N times, which is fine.
 * The entry is removed when the rebuild settles, so a failed rebuild is
 * never cached: its waiters see the error and the next request retries.
 * Key "db" is the Redis-down path, where there's no version to key on.
 */
const inflightRebuilds = new Map<string, Promise<WorkspaceNav>>();

function rebuildOnce(version: string | undefined): Promise<WorkspaceNav> {
  const key = version ?? "db";
  let rebuild = inflightRebuilds.get(key);
  if (!rebuild) {
    rebuild = rebuildAndPopulate(version).finally(() => {
      inflightRebuilds.delete(key);
    });
    inflightRebuilds.set(key, rebuild);
  }
  return rebuild;
}

async function rebuildAndPopulate(version: string | undefined): Promise<WorkspaceNav> {
  const nav = await buildWorkspaceNav(db);

  if (version !== undefined) {
    remember(version, nav);
    try {
      await redis.set(`${NAV_KEY_PREFIX}${version}`, JSON.stringify(nav), "EX", NAV_TTL_SECONDS);
    } catch (error) {
      logger.warn(
        { err: error },
        "Redis unavailable; could not populate the workspace navigation cache",
      );
    }
  }

  return nav;
}

export async function getWorkspaceNav(): Promise<WorkspaceNav> {
  let version: string | undefined;

  try {
    version = await getCurrentVersion();
    if (memo?.version === version) {
      return memo.nav;
    }
    const cached = await redis.get(`${NAV_KEY_PREFIX}${version}`);
    if (cached) {
      return remember(version, JSON.parse(cached) as WorkspaceNav);
    }
  } catch (error) {
    logger.warn(
      { err: error },
      "Redis unavailable; falling through to Postgres for workspace navigation",
    );
  }

  return rebuildOnce(version);
}
