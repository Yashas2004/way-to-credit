/** Swappable SMS transport — every caller depends only on this interface, never on a concrete implementation. */
export interface SmsProvider {
  send(to: string, message: string): Promise<void>;
}
