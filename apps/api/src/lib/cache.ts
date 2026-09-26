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

export async function getDescriptionTree(): Promise<DescriptionTreeBank[]> {
  let version: string | undefined;

  try {
    version = await getCurrentVersion();
    const cached = await redis.get(`${TREE_KEY_PREFIX}${version}`);
    if (cached) {
      return JSON.parse(cached) as DescriptionTreeBank[];
    }
  } catch (error) {
    logger.warn(
      { err: error },
      "Redis unavailable; falling through to Postgres for the description tree",
    );
  }

  const tree = await buildDescriptionTree(db);

  if (version !== undefined) {
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
