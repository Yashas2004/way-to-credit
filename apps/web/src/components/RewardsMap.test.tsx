import { render, screen, within } from "@testing-library/react";
import type { RewardsMilestone } from "@way-to-credit/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardsMap } from "./RewardsMap";

vi.mock("../lib/userApi", () => ({
  markMilestoneSeen: vi.fn().mockResolvedValue({ status: "ok" }),
}));

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: vi.fn(() => false) };
});

import { markMilestoneSeen } from "../lib/userApi";
import { useReducedMotion } from "framer-motion";

const mockMarkMilestoneSeen = vi.mocked(markMilestoneSeen);
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

describe("RewardsMap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMarkMilestoneSeen.mockClear();
    mockUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("animates an unseen milestone and posts seen only after the animation finishes", async () => {
    const milestones = [
      milestone({
        milestoneId: "unseen-1",
        unlockedAt: "2026-01-01T00:00:00.000Z",
        seenAt: null,
      }),
    ];
    render(<RewardsMap creditPoints={5} milestones={milestones} />);

    // Not yet posted immediately on mount — the animation hasn't finished.
    expect(mockMarkMilestoneSeen).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(mockMarkMilestoneSeen).not.toHaveBeenCalled();

    // Past the (0-index stagger + break duration) window.
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
    render(<RewardsMap creditPoints={5} milestones={milestones} />);

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
    render(<RewardsMap creditPoints={5} milestones={milestones} />);

    await vi.advanceTimersByTimeAsync(0);
    expect(mockMarkMilestoneSeen).toHaveBeenCalledWith("unseen-reduced");
  });

  it("renders a real ordered list with a labeled item per milestone, comprehensible without the SVG", async () => {
    const milestones = [
      milestone({
        milestoneId: "m1",
        levelNumber: 1,
        pointsRequired: 5,
        unlockedAt: "x",
        seenAt: "y",
      }),
      milestone({
        milestoneId: "m2",
        levelNumber: 2,
        pointsRequired: 10,
        unlockedAt: null,
        seenAt: null,
      }),
    ];
    render(<RewardsMap creditPoints={5} milestones={milestones} />);
    await vi.advanceTimersByTimeAsync(0);

    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [firstItem, secondItem] = items;
    if (!firstItem || !secondItem) throw new Error("expected exactly 2 list items");
    expect(within(firstItem).getByText(/Level 1/)).toBeInTheDocument();
    expect(within(firstItem).getByText("Unlocked")).toBeInTheDocument();
    expect(within(secondItem).getByText(/Locked — 5 points to go/)).toBeInTheDocument();

    // The decorative graphic is hidden from assistive tech — the list above
    // is the accessible source of truth.
    const { container } = render(<RewardsMap creditPoints={5} milestones={milestones} />);
    const svgs = container.querySelectorAll("svg");
    svgs.forEach((svg) => {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    });
  });
});
