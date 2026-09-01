import { logger } from "../logger.js";
import type { SmsProvider } from "./SmsProvider.js";

/**
 * Logs the full message — OTP digits included — via the structured logger
 * instead of actually sending anything. This is deliberately what's live in
 * every environment today, including production: TRAI DLT registration
 * for the real MSG91 sender isn't complete yet, so this is how an admin
 * actually receives their OTP for now (read it from the server log).
 */
export class ConsoleSmsProvider implements SmsProvider {
  async send(to: string, message: string): Promise<void> {
    logger.info({ to, message }, "SMS (console provider — not actually sent)");
    return Promise.resolve();
  }
}
