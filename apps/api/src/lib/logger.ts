import pino from "pino";
import { env } from "../config/env.js";

const level = env.NODE_ENV === "test" ? "silent" : "info";

// The pino-pretty transport spins up its own worker thread (via
// thread-stream) and registers a `process.on('exit', ...)` listener that's
// never torn down — harmless for one long-lived process, but this module is
// re-instantiated per test file, so under test it would leak one listener
// per file with nothing to show for it (level is silent; there's no output
// to prettify). Only wire up the transport in development, where a human is
// actually reading the console.
export const logger =
  env.NODE_ENV === "development"
    ? pino({
        level,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
            singleLine: true,
          },
        },
      })
    : pino({ level });

export function childLogger(requestId: string) {
  return logger.child({ requestId });
}
