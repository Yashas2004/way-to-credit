import { db } from "../db/client.js";
import { buildDescriptionTree, type DescriptionTreeBank } from "./descriptionTree.js";
import { logger } from "./logger.js";
import { redis } from "./redis.js";

// Version-pointer + versioned-data-key scheme (not one literal Redis key):
// `tree:version` is a plain counter; the payload lives at `tree:v<N>`.
// Invalidation only ever INCRs the version, never DELs a data key — so a
// slow concurrent reader that already read the old version number can only
// ever repopulate the now-abandoned old key, never clobber the new one.
// That's what makes "a concurrent read can never repopulate a stale value"
// true without needing a DEL at all. Versioned data keys carry a short TTL
// so abandoned ones self-clean instead of accumulating.
const VERSION_KEY = "tree:version";
const TREE_KEY_PREFIX = "tree:v";
const TREE_TTL_SECONDS = 5 * 60;

async function getCurrentVersion(): Promise<number> {
  const raw = await redis.get(VERSION_KEY);
  return raw ? Number(raw) : 1;
}

/** Called by every mutating admin route in this stage, after its transaction commits. */
export async function invalidateDescriptionTreeCache(): Promise<void> {
  try {
    await redis.incr(VERSION_KEY);
  } catch (error) {
    logger.warn(
      { err: error },
      "Redis unavailable; could not invalidate the description tree cache",
    );
  }
}

export async function getDescriptionTree(): Promise<DescriptionTreeBank[]> {
  let version: number | undefined;

  try {
    version = await getCurrentVersion();
    const cached = await redis.get(`${TREE_KEY_PREFIX}${String(version)}`);
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
      await redis.set(
        `${TREE_KEY_PREFIX}${String(version)}`,
        JSON.stringify(tree),
        "EX",
        TREE_TTL_SECONDS,
      );
    } catch (error) {
      logger.warn(
        { err: error },
        "Redis unavailable; could not populate the description tree cache",
      );
    }
  }

  return tree;
}
