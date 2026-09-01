import type { SmsProvider } from "./SmsProvider.js";

const MSG91_SEND_URL = "https://control.msg91.com/api/v5/flow/";

/**
 * Real implementation, not yet live anywhere — TRAI DLT registration for
 * the sender isn't complete, so `SMS_PROVIDER` is `"console"` in every
 * environment today (see `lib/sms/index.ts`). Structurally correct against
 * MSG91's Flow API but untested against a live account; once DLT
 * registration completes, this will need a real `flowId`/`sender` (DLT
 * template id and registered sender header) — currently uses a bare
 * freeform-message shape that will need adjusting to match the actual
 * approved template.
 *
 * TODO once this goes live: forgot-password's timing-safety padding
 * (an "admin exists" response currently costs a real network round-trip
 * here, while a "doesn't exist" response returns near-instantly) — see the
 * comment in `auth.service.ts::forgotPassword`. Deferred deliberately while
 * `ConsoleSmsProvider` (synchronous, no asymmetric latency) is what's live.
 */
export class Msg91SmsProvider implements SmsProvider {
  constructor(private readonly authKey: string) {}

  async send(to: string, message: string): Promise<void> {
    const res = await fetch(MSG91_SEND_URL, {
      method: "POST",
      headers: {
        authkey: this.authKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients: [{ mobiles: to, message }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`MSG91 SMS send failed: ${String(res.status)} ${body}`);
    }
  }
}
