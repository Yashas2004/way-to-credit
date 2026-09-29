import type { WorkspaceNavResponse } from "@way-to-credit/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECENT_LOOKUPS_MAX,
  readRecentLookups,
  recordRecentLookup,
  resolveRecentLookups,
  tripleFromParams,
  workspaceHref,
} from "./recentLookups";

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const USER = id(9000);
const OTHER_USER = id(9001);
const triple = (n: number) => ({ bankId: id(n), loanTypeId: id(100 + n), statusId: id(200) });

describe("recent lookups", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("puts the newest first, moves a repeat to the top rather than duplicating it, and keeps 8", () => {
    for (let n = 1; n <= 10; n++) recordRecentLookup(USER, triple(n));
    recordRecentLookup(USER, triple(5));
    const list = readRecentLookups(USER);
    expect(list).toHaveLength(RECENT_LOOKUPS_MAX);
    expect(list.map((e) => e.bankId)).toEqual([5, 10, 9, 8, 7, 6, 4, 3].map((n) => id(n)));
  });

  it("stores ids and a time only", () => {
    recordRecentLookup(USER, triple(1), new Date("2026-09-29T06:30:00Z"));
    expect(JSON.parse(window.localStorage.getItem(`wtc.recent.v1.${USER}`) ?? "")).toEqual([
      { ...triple(1), at: "2026-09-29T06:30:00.000Z" },
    ]);
  });

  it("keeps each user's list separate", () => {
    recordRecentLookup(USER, triple(1));
    expect(readRecentLookups(OTHER_USER)).toEqual([]);
  });

  it("works with storage blocked: reads come back empty and writes are dropped quietly", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(readRecentLookups(USER)).toEqual([]);
    expect(recordRecentLookup(USER, triple(1))).toHaveLength(1);
  });

  it("ignores corrupt or tampered storage", () => {
    const key = `wtc.recent.v1.${USER}`;
    window.localStorage.setItem(key, "{not json");
    expect(readRecentLookups(USER)).toEqual([]);
    window.localStorage.setItem(
      key,
      JSON.stringify([
        { bankId: "<script>", loanTypeId: id(1), statusId: id(2), at: "2026-09-29T06:30:00Z" },
        { ...triple(1), at: "not a date" },
        { ...triple(2), at: "2026-09-29T06:30:00Z" },
      ]),
    );
    expect(readRecentLookups(USER).map((e) => e.bankId)).toEqual([id(2)]);
  });

  it("resolves names from navigation data and drops anything withdrawn or detached", () => {
    const nav: WorkspaceNavResponse = {
      statuses: [{ id: id(200), name: "Login", sortOrder: 1 }],
      loanTypes: [
        { id: id(101), name: "Home Loan" },
        { id: id(102), name: "Car Loan" },
      ],
      banks: [
        { id: id(1), name: "HDFC Bank", loanTypes: [0] },
        { id: id(2), name: "Axis Bank", loanTypes: [] }, // Car Loan detached from Axis
      ],
    };
    const at = "2026-09-29T06:30:00.000Z";
    const resolved = resolveRecentLookups(
      [
        { ...triple(1), at },
        { ...triple(2), at },
        { ...triple(3), at }, // bank withdrawn
        { ...triple(1), statusId: id(201), at }, // status withdrawn
      ],
      nav,
    );
    expect(resolved).toEqual([
      { ...triple(1), at, bankName: "HDFC Bank", loanTypeName: "Home Loan", statusName: "Login" },
    ]);
  });

  it("reads a triple back from the Workspace URL it builds, and flags bad params", () => {
    const url = new URL(workspaceHref(triple(1)), "http://localhost");
    expect(url.pathname).toBe("/user/workspace");
    expect(tripleFromParams(url.searchParams)).toEqual(triple(1));
    expect(tripleFromParams(new URLSearchParams(""))).toBeNull();
    expect(tripleFromParams(new URLSearchParams(`bank=${id(1)}`))).toBe("invalid");
    expect(tripleFromParams(new URLSearchParams(`bank=x&loanType=${id(1)}&status=${id(2)}`))).toBe(
      "invalid",
    );
  });
});
