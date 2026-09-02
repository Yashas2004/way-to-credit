/**
 * Masks the password component of a Postgres connection string for safe
 * logging — even a throwaway local-dev credential shouldn't show up
 * verbatim in console output. Falls back to a fixed placeholder rather than
 * throwing if the string isn't a parseable URL, since this only ever backs
 * a diagnostic log line, never a control-flow decision.
 */
export function maskDatabaseUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}
