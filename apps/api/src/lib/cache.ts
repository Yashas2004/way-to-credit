import { db } from "../db/client.js";
import { buildDescriptionTree, type DescriptionTreeBank } from "./descriptionTree.js";
import { logger } from "./logger.js";
import { uuidv7 } from "uuidv7";
import { redis } from "./redis.js";

// Version-pointer + versioned-data-key scheme (not one literal Redis key):
// `tree:version` holds an opaque version token; the payload lives at
// `tree:v<token>`. Invalidation only ever replaces the token, never DELs a
// data key — so a slow concurrent reader that already read the old token
// can only ever repopulate the now-abandoned old key, never clobber the new
// one. Versioned data keys carry a short TTL so abandoned ones self-clean.
//
// Tokens are fresh UUIDs, never a counter. A counter broke whenever
// `tree:version` went missing (fresh Redis, restart without persistence,
// eviction, a flush): readers defaulted to 1 and cached under `tree:v1`,
// then the next admin write's INCR created the key at 1 — the same version
// — so that write's invalidation was silently lost and users saw the stale
// tree for up to the TTL. A fresh token can't collide with any cached key.
const VERSION_KEY = "tree:version";
const TREE_KEY_PREFIX = "tree:v";
const TREE_TTL_SECONDS = 5 * 60;

async function getCurrentVersion(): Promise<string> {
  const existing = await redis.get(VERSION_KEY);
  if (existing) return existing;
  // Missing: create one atomically. NX so concurrent readers (or a write
  // racing them) agree on whichever token landed first; read it back.
  await redis.set(VERSION_KEY, uuidv7(), "NX");
  return (await redis.get(VERSION_KEY)) ?? uuidv7();
}

/** Called by every mutating admin route in this stage, after its transaction commits. */
export async function invalidateDescriptionTreeCache(): Promise<void> {
  try {
    await redis.set(VERSION_KEY, uuidv7());
  } catch (error) {
    logger.warn(
      { err: error },
      "Redis unavailable; could not invalidate the description tree cache",
    );
  }
}

/**
 * The parsed tree for the version this instance last saw. Every request
 * still reads the (tiny) version token from Redis, so an admin write on any
 * instance invalidates this on every instance at the next request — CLAUDE.md
 * invariant 19 holds exactly as before. What it saves is the payload: at a
 * year's data the tree is ~1.4 MB of JSON, which every lookup used to fetch
 * from Redis and parse (11 ms locally, far more over a network to managed
 * Redis, and ~40 GB/day of Redis traffic at 300 users). Deep-frozen because
 * it's shared across requests: a caller mutating it throws, loudly, instead
 * of corrupting everyone else's view. Never used on the Redis-down path —
 * without a version there's no way to know it's current.
 */
let memo: { version: string; tree: DescriptionTreeBank[] } | null = null;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function remember(version: string, tree: DescriptionTreeBank[]): DescriptionTreeBank[] {
  const frozen = deepFreeze(tree);
  memo = { version, tree: frozen };
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
const inflightRebuilds = new Map<string, Promise<DescriptionTreeBank[]>>();

function rebuildOnce(version: string | undefined): Promise<DescriptionTreeBank[]> {
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

async function rebuildAndPopulate(version: string | undefined): Promise<DescriptionTreeBank[]> {
  const tree = await buildDescriptionTree(db);

  if (version !== undefined) {
    remember(version, tree);
    try {
      await redis.set(`${TREE_KEY_PREFIX}${version}`, JSON.stringify(tree), "EX", TREE_TTL_SECONDS);
    } catch (error) {
      logger.warn(
        { err: error },
        "Redis unavailable; could not populate the description tree cache",
      );
    }
  }

  return tree;
}

export async function getDescriptionTree(): Promise<DescriptionTreeBank[]> {
  let version: string | undefined;

  try {
    version = await getCurrentVersion();
    if (memo?.version === version) {
      return memo.tree;
    }
    const cached = await redis.get(`${TREE_KEY_PREFIX}${version}`);
    if (cached) {
      return remember(version, JSON.parse(cached) as DescriptionTreeBank[]);
    }
  } catch (error) {
    logger.warn(
      { err: error },
      "Redis unavailable; falling through to Postgres for the description tree",
    );
  }

  return rebuildOnce(version);
}
