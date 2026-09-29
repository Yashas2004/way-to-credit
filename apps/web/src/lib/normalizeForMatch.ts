/** Case- and whitespace-insensitive matching key: trimmed, runs of whitespace collapsed, lower-cased. */
export function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}
