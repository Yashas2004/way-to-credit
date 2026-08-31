import pino from "pino";
import { env } from "../config/env.js";

const isProduction = env.NODE_ENV === "production";

const level = env.NODE_ENV === "test" ? "silent" : "info";

export const logger = isProduction
  ? pino({ level })
  : pino({
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
    });

export function childLogger(requestId: string) {
  return logger.child({ requestId });
}
