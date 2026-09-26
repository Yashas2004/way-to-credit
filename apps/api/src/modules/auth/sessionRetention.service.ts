import { db } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import * as authRepo from "./auth.repo.js";

/**
 * Ended sessions (revoked, or else expired) are audit evidence — "when did
 * this user log in, from what IP" — so they're kept for 90 days after they
 * ended, then deleted. Without this, token rotation (a new row every ~10
 * minutes of activity) grows the table by ~4.9M rows / 1.8 GB a year at
 * 300 users.
 */
export const SESSION_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_BATCH_SIZE = 5_000;
// Caps one run at 1M rows so a first run against a large backlog can't
// monopolise a pool connection for long; the next run carries on.
const MAX_BATCHES_PER_RUN = 200;

export async function purgeEndedSessions(
  now: Date = new Date(),
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<number> {
  const cutoff = new Date(now.getTime() - SESSION_RETENTION_DAYS * DAY_MS);
  let total = 0;
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const deleted = await authRepo.deleteSessionsEndedBefore(db, cutoff, batchSize);
    total += deleted;
    if (deleted < batchSize) break;
  }
  return total;
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
          logger.info({ deleted, retentionDays: SESSION_RETENTION_DAYS }, "Purged ended sessions");
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
