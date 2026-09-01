import { env } from "../../config/env.js";
import { ConsoleSmsProvider } from "./ConsoleSmsProvider.js";
import { Msg91SmsProvider } from "./Msg91SmsProvider.js";
import type { SmsProvider } from "./SmsProvider.js";

/**
 * Selected once at module load (app boot) by `SMS_PROVIDER`. Every caller
 * imports `smsProvider` and calls `.send(...)` — swapping providers is a
 * one-line env change, no calling code ever changes.
 */
function createSmsProvider(): SmsProvider {
  if (env.SMS_PROVIDER === "msg91") {
    if (!env.MSG91_AUTH_KEY) {
      // Fails at boot, not silently — consistent in spirit with
      // config/env.ts's "fail to start if a required secret is missing,"
      // without making MSG91_AUTH_KEY unconditionally required (it isn't;
      // console is what's actually live everywhere today).
      throw new Error("MSG91_AUTH_KEY is required when SMS_PROVIDER=msg91");
    }
    return new Msg91SmsProvider(env.MSG91_AUTH_KEY);
  }
  return new ConsoleSmsProvider();
}

export const smsProvider: SmsProvider = createSmsProvider();
export type { SmsProvider } from "./SmsProvider.js";
