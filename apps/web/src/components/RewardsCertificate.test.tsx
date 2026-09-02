import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CreditHistoryResponse, RewardsMilestone } from "@way-to-credit/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardsCertificate } from "./RewardsCertificate";

vi.mock("../lib/userApi", () => ({
  markMilestoneSeen: vi.fn().mockResolvedValue({ status: "ok" }),
  fetchCreditHistory: vi.fn(),
}));

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: vi.fn(() => false) };
});

import { useReducedMotion } from "framer-motion";
import { fetchCreditHistory, markMilestoneSeen } from "../lib/userApi";

const mockMarkMilestoneSeen = vi.mocked(markMilestoneSeen);
const mockFetchCreditHistory = vi.mocked(fetchCreditHistory);
const mockUseReducedMotion = vi.mocked(useReducedMotion);

function milestone(overrides: Partial<RewardsMilestone>): RewardsMilestone {
  return {
    milestoneId: "m1",
    levelNumber: 1,
    pointsRequired: 5,
    title: "Level 1",
    message: "Recognition in the team channel",
    unlockedAt: null,
    seenAt: null,
    ...overrides,
  };
}

function renderCertificate(props: { creditPoints: number; milestones: RewardsMilestone[] }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RewardsCertificate displayName="Priya Sharma" {...props} />
    </QueryClientProvider>,
  );
}

const EMPTY_HISTORY: CreditHistoryResponse = { items: [], nextCursor: null };

describe("RewardsCertificate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMarkMilestoneSeen.mockClear();
    mockFetchCreditHistory.mockReset();
    mockFetchCreditHistory.mockResolvedValue(EMPTY_HISTORY);
    mockUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("animates an unseen milestone and posts seen only after the animation finishes", async () => {
    const milestones = [
      milestone({ milestoneId: "unseen-1", unlockedAt: "2026-01-01T00:00:00.000Z", seenAt: null }),
      milestone({ milestoneId: "m2", levelNumber: 2, pointsRequired: 10 }),
    ];
    renderCertificate({ creditPoints: 5, milestones });

    expect(mockMarkMilestoneSeen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(mockMarkMilestoneSeen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(mockMarkMilestoneSeen).toHaveBeenCalledWith("unseen-1");
    expect(mockMarkMilestoneSeen).toHaveBeenCalledTimes(1);
  });

  it("does not animate or post seen for an already-seen milestone", async () => {
    const milestones = [
      milestone({
        milestoneId: "seen-1",
        unlockedAt: "2026-01-01T00:00:00.000Z",
        seenAt: "2026-01-01T00:05:00.000Z",
      }),
    ];
    renderCertificate({ creditPoints: 5, milestones });
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockMarkMilestoneSeen).not.toHaveBeenCalled();
  });

  it("under prefers-reduced-motion, reveals the final state immediately and still posts seen", async () => {
    mockUseReducedMotion.mockReturnValue(true);
    const milestones = [
      milestone({
        milestoneId: "unseen-reduced",
        unlockedAt: "2026-01-01T00:00:00.000Z",
        seenAt: null,
      }),
    ];
    renderCertificate({ creditPoints: 5, milestones });
    await vi.advanceTimersByTimeAsync(0);
    expect(mockMarkMilestoneSeen).toHaveBeenCalledWith("unseen-reduced");
  });

  it("merges the visual and accessible structure into one real ordered list, one row per milestone", async () => {
    const milestones = [
      milestone({
        milestoneId: "m1",
        levelNumber: 1,
        pointsRequired: 5,
        unlockedAt: "2026-01-01T00:00:00.000Z",
        seenAt: "2026-01-01T00:05:00.000Z",
      }),
      milestone({
        milestoneId: "m2",
        levelNumber: 2,
        pointsRequired: 10,
        unlockedAt: null,
        seenAt: null,
      }),
    ];
    renderCertificate({ creditPoints: 5, milestones });
    await vi.advanceTimersByTimeAsync(0);

    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [firstItem, secondItem] = items;
    if (!firstItem || !secondItem) throw new Error("expected exactly 2 list items");

    expect(within(firstItem).getByText(/Level 1/)).toBeInTheDocument();
    expect(within(firstItem).getByText("Unlocked")).toBeInTheDocument();
    expect(within(firstItem).getByText("Recognition in the team channel")).toBeInTheDocument();

    // No separate SVG map duplicating this — every svg present is inside
    // one of the list's own rows and purely decorative.
    const svgs = document.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(list.contains(svg)).toBe(true);
    });
  });

  it("gives the immediate next milestone hero treatment: a distinct badge and a progress readout", async () => {
    const milestones = [
      milestone({
        milestoneId: "m1",
        levelNumber: 1,
        pointsRequired: 5,
        unlockedAt: "x",
        seenAt: "y",
      }),
      milestone({ milestoneId: "m2", levelNumber: 2, pointsRequired: 10 }),
      milestone({ milestoneId: "m3", levelNumber: 3, pointsRequired: 15 }),
    ];
    renderCertificate({ creditPoints: 7, milestones });
    await vi.advanceTimersByTimeAsync(0);

    // Level 2 (10 points) is next; level 3 (15) is locked but not next.
    expect(screen.getByText(/Next — 3 points to go/)).toBeInTheDocument();
    expect(screen.getByText(/Locked — 8 points to go/)).toBeInTheDocument();
    expect(screen.getByText("7 of 10 points")).toBeInTheDocument();
  });

  it("locked, non-hero seals are not interactive and say Locked plainly", async () => {
    const milestones = [
      milestone({ milestoneId: "m1", levelNumber: 1, pointsRequired: 5 }),
      milestone({ milestoneId: "m2", levelNumber: 2, pointsRequired: 10 }),
    ];
    renderCertificate({ creditPoints: 0, milestones });
    await vi.advanceTimersByTimeAsync(0);

    // Level 1 is the hero (locked but next); level 2 is locked and not next.
    expect(screen.getAllByText("Locked")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Level 2/i })).not.toBeInTheDocument();
  });

  it("expands an unlocked seal on click to show its contributing query history, and collapses on a second click", async () => {
    mockFetchCreditHistory.mockResolvedValue({
      items: [
        {
          id: "tx1",
          delta: 1,
          reason: "Query approved",
          createdAt: "2026-01-01T00:00:00.000Z",
          queryId: "q1",
          bankNameSnapshot: "HDFC Bank",
          loanTypeNameSnapshot: "Home Loan",
          statusNameSnapshot: "Sanctioned",
        },
      ],
      nextCursor: null,
    });

    const milestones = [
      milestone({
        milestoneId: "m1",
        levelNumber: 1,
        pointsRequired: 5,
        unlockedAt: "2026-01-01T00:00:00.000Z",
        seenAt: "2026-01-01T00:05:00.000Z",
      }),
    ];
    renderCertificate({ creditPoints: 5, milestones });
    await vi.advanceTimersByTimeAsync(0);

    const toggle = screen.getByRole("button", { name: /show how you earned level 1/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Fake timers intercept the setTimeout RTL's findBy*/waitFor poll with,
    // so flush the mocked fetch's already-resolved promise explicitly
    // instead of awaiting findByText.
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText(/HDFC Bank — Home Loan/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /hide how you earned level 1/i }));
    expect(screen.queryByText(/HDFC Bank — Home Loan/)).not.toBeInTheDocument();
  });
});
