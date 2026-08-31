import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDb } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { closeRedis } from "./lib/redis.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on port ${String(env.PORT)}`);
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown`);

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out after 10s, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error while closing HTTP server");
    }

    void Promise.all([closeDb(), closeRedis()])
      .catch((closeErr: unknown) => {
        logger.error({ err: closeErr }, "Error while closing connection pools");
      })
      .finally(() => {
        clearTimeout(forceExit);
        process.exit(err ? 1 : 0);
      });
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
