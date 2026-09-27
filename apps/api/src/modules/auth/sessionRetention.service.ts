import { db } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import * as authRepo from "./auth.repo.js";

/**
 * Session rows serve two purposes, retained for different lengths:
 *
 * - A family's first row is the login (who, when, from what IP/browser).
 *   Kept 90 days after it ended (revoked, or else expired). activity_log
 *   also records every login; this is the session-side copy.
 * - Every later row in a family is a token refresh (one per ~10 minutes of
 *   activity) — ~99% of rows. It isn't audit evidence, but refresh-token
 *   reuse detection needs a rotated row to exist while its token could still
 *   be replayed, or a theft replay gets a plain 401 instead of revoking the
 *   attacker's family. So it's kept until 3 days after its own token expires
 *   (refresh tokens live 7 days) — ~10 days — then deleted.
 * - A family marked compromised (reuse detected) is security evidence in
 *   full: every row, refreshes included, is kept 90 days from detection.
 *
 * Measured at 300 users: keeping every row 90 days was ~485 MB; this keeps
 * the table to tens of MB.
 */
export const LONG_RETENTION_DAYS = 90;
export const SUPERSEDED_GRACE_DAYS_AFTER_EXPIRY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_BATCH_SIZE = 5_000;
// Caps one rule's run at 1M rows so a first run against a large backlog
// can't monopolise a pool connection for long; the next run carries on.
const MAX_BATCHES_PER_RUN = 200;

async function drain(deleteBatch: () => Promise<number>, batchSize: number): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const deleted = await deleteBatch();
    total += deleted;
    if (deleted < batchSize) break;
  }
  return total;
}

export async function purgeEndedSessions(
  now: Date = new Date(),
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<number> {
  const supersededCutoff = new Date(now.getTime() - SUPERSEDED_GRACE_DAYS_AFTER_EXPIRY * DAY_MS);
  const longCutoff = new Date(now.getTime() - LONG_RETENTION_DAYS * DAY_MS);
  const superseded = await drain(
    () => authRepo.deleteSupersededRefreshRowsExpiredBefore(db, supersededCutoff, batchSize),
    batchSize,
  );
  const long = await drain(
    () => authRepo.deleteLongRetentionRowsEndedBefore(db, longCutoff, batchSize),
    batchSize,
  );
  return superseded + long;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * In-process schedule: one run shortly after boot, then hourly. Safe with
 * several instances running it at once — batches use SKIP LOCKED, so
 * concurrent runs split the work and never delete a row twice; a run that
 * finds nothing to do is a single indexed query. The first run is delayed
 * 1–2 minutes (jittered) so it never competes with boot or with the other
 * instances' first runs. A tick is skipped if the previous run is still
 * going. Runs off the request path entirely, so it can't add latency to a
 * login. Returns a stop function for graceful shutdown.
 */
export function startSessionRetentionSchedule(): () => void {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    purgeEndedSessions()
      .then((deleted) => {
        if (deleted > 0) {
          logger.info({ deleted }, "Purged ended sessions");
        }
      })
      .catch((error: unknown) => {
        logger.warn({ err: error }, "Session retention run failed; will retry next interval");
      })
      .finally(() => {
        running = false;
      });
  };

  const firstRun = setTimeout(run, 60_000 + Math.floor(Math.random() * 60_000));
  const interval = setInterval(run, HOUR_MS);
  firstRun.unref();
  interval.unref();
  return () => {
    clearTimeout(firstRun);
    clearInterval(interval);
  };
}
