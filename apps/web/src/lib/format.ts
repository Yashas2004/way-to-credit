/** "in about 12 minutes" / "in about an hour" — human terms for a 429's retryAfterSeconds. */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) {
    return "in under a minute";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `in about ${String(minutes)} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.round(minutes / 60);
  return `in about ${String(hours)} hour${hours === 1 ? "" : "s"}`;
}
