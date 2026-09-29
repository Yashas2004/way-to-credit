import { uuidParam, type WorkspaceNavResponse } from "@way-to-credit/shared";
import { useCallback, useState } from "react";

/**
 * Recent lookups: a per-browser convenience, not a record. Only the three ids
 * and when are stored, never names or description text; names are resolved
 * from the navigation data at render time, so anything withdrawn since just
 * drops out. Keyed by user id so a second person on the same machine doesn't
 * see the first person's list. Storage can be blocked, full, or cleared (a
 * private window); every access is wrapped so the page works without it.
 * Decided in the UX pass: server-side history would mean a table, retention
 * rules and a new category of recorded user behaviour, for a few seconds saved.
 */

export interface Triple {
  bankId: string;
  loanTypeId: string;
  statusId: string;
}

export interface RecentLookup extends Triple {
  /** ISO time of the lookup. */
  at: string;
}

export interface ResolvedLookup extends RecentLookup {
  bankName: string;
  loanTypeName: string;
  statusName: string;
}

export const RECENT_LOOKUPS_MAX = 8;

const storageKey = (userId: string) => `wtc.recent.v1.${userId}`;

function isRecentLookup(value: unknown): value is RecentLookup {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    uuidParam.safeParse(v["bankId"]).success &&
    uuidParam.safeParse(v["loanTypeId"]).success &&
    uuidParam.safeParse(v["statusId"]).success &&
    typeof v["at"] === "string" &&
    !Number.isNaN(Date.parse(v["at"]))
  );
}

export function sameTriple(a: Triple, b: Triple): boolean {
  return a.bankId === b.bankId && a.loanTypeId === b.loanTypeId && a.statusId === b.statusId;
}

export function readRecentLookups(userId: string): RecentLookup[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentLookup).slice(0, RECENT_LOOKUPS_MAX) : [];
  } catch {
    return [];
  }
}

/** Puts `triple` at the top (moving it if already listed), keeps the newest 8, and returns the new list. */
export function recordRecentLookup(
  userId: string,
  triple: Triple,
  now = new Date(),
): RecentLookup[] {
  const next = [
    {
      bankId: triple.bankId,
      loanTypeId: triple.loanTypeId,
      statusId: triple.statusId,
      at: now.toISOString(),
    },
    ...readRecentLookups(userId).filter((entry) => !sameTriple(entry, triple)),
  ].slice(0, RECENT_LOOKUPS_MAX);
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Blocked or full: the list just isn't remembered.
  }
  return next;
}

/** True when the bank, loan type and status all exist and the pair is attached. */
export function isAvailable(nav: WorkspaceNavResponse, triple: Triple): boolean {
  const bank = nav.banks.find((b) => b.id === triple.bankId);
  if (!bank) return false;
  const attached = bank.loanTypes.some((i) => nav.loanTypes[i]?.id === triple.loanTypeId);
  return attached && nav.statuses.some((s) => s.id === triple.statusId);
}

/** Names from the navigation data; entries that no longer resolve are dropped. */
export function resolveRecentLookups(
  entries: RecentLookup[],
  nav: WorkspaceNavResponse,
): ResolvedLookup[] {
  return entries.flatMap((entry) => {
    if (!isAvailable(nav, entry)) return [];
    const bank = nav.banks.find((b) => b.id === entry.bankId);
    const loanType = nav.loanTypes.find((lt) => lt.id === entry.loanTypeId);
    const status = nav.statuses.find((s) => s.id === entry.statusId);
    return bank && loanType && status
      ? [{ ...entry, bankName: bank.name, loanTypeName: loanType.name, statusName: status.name }]
      : [];
  });
}

/** The Workspace URL for a triple: opening it shows that description. */
export function workspaceHref(triple: Triple): string {
  const params = new URLSearchParams({
    bank: triple.bankId,
    loanType: triple.loanTypeId,
    status: triple.statusId,
  });
  return `/user/workspace?${params.toString()}`;
}

/**
 * Reads a triple from Workspace URL params. `null` when none of the three is
 * present (a plain visit); "invalid" when any is present but the set isn't
 * three well-formed ids.
 */
export function tripleFromParams(params: URLSearchParams): Triple | null | "invalid" {
  const bankId = params.get("bank");
  const loanTypeId = params.get("loanType");
  const statusId = params.get("status");
  if (bankId === null && loanTypeId === null && statusId === null) return null;
  if (
    !uuidParam.safeParse(bankId).success ||
    !uuidParam.safeParse(loanTypeId).success ||
    !uuidParam.safeParse(statusId).success
  ) {
    return "invalid";
  }
  return { bankId: bankId ?? "", loanTypeId: loanTypeId ?? "", statusId: statusId ?? "" };
}

/** The list for one user, with a `record` that updates it in place. */
export function useRecentLookups(userId: string | undefined) {
  const [entries, setEntries] = useState<RecentLookup[]>(() =>
    userId ? readRecentLookups(userId) : [],
  );
  const record = useCallback(
    (triple: Triple) => {
      if (userId) setEntries(recordRecentLookup(userId, triple));
    },
    [userId],
  );
  return { entries, record };
}
