const istDateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "2 Sep 2026, 3:45 pm" IST — the one admin-screen date formatter, shared rather than redefined per page. */
export function formatIstDateTime(iso: string): string {
  return istDateTimeFormatter.format(new Date(iso));
}

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

const istDateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
});

/**
 * "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago", then the IST
 * date: how long ago, in the fewest words that still say it.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${String(days)} days ago`;
  return istDateFormatter.format(new Date(iso));
}
