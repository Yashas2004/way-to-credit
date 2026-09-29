import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type {
  IssueSummary,
  QueryRow,
  RewardsMapResponse,
  WorkspaceNavResponse,
} from "@way-to-credit/shared";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";

const USER_ID = "0190a000-0000-7000-8000-000000000001";

vi.mock("../../lib/auth", () => ({
  useAuth: () => ({
    identity: { id: USER_ID, role: "user", identifier: "u1", displayName: "Asha Rao" },
  }),
}));

vi.mock("../../lib/userApi", () => ({
  fetchWorkspaceNav: vi.fn(),
  fetchIssueUnreadCount: vi.fn(),
  fetchOwnIssues: vi.fn(),
  fetchOwnQueries: vi.fn(),
  fetchRewardsMap: vi.fn(),
}));

import {
  fetchIssueUnreadCount,
  fetchOwnIssues,
  fetchOwnQueries,
  fetchRewardsMap,
  fetchWorkspaceNav,
} from "../../lib/userApi";

const B = "0190a000-0000-7000-8000-00000000000b";
const LT = "0190a000-0000-7000-8000-0000000000a1";
const ST = "0190a000-0000-7000-8000-0000000000c1";
const NAV: WorkspaceNavResponse = {
  statuses: [{ id: ST, name: "Sanctioned", sortOrder: 1 }],
  loanTypes: [{ id: LT, name: "Home Loan" }],
  banks: [{ id: B, name: "HDFC Bank", loanTypes: [0] }],
};

const issue = (over: Partial<IssueSummary>): IssueSummary => ({
  id: "0190a000-0000-7000-8000-000000000101",
  subject: "Muthoot Finance is missing",
  status: "awaiting_user",
  openedAt: "2026-09-29T05:00:00.000Z",
  lastActivityAt: "2026-09-29T06:00:00.000Z",
  resolvedAt: null,
  unread: true,
  ...over,
});

let n = 0;
const query = (status: QueryRow["status"]): QueryRow => ({
  id: `0190a000-0000-7000-8000-${String(++n).padStart(12, "0")}`,
  bankId: B,
  loanTypeId: LT,
  statusId: ST,
  bankNameSnapshot: "HDFC Bank",
  loanTypeNameSnapshot: "Home Loan",
  statusNameSnapshot: `Sanctioned ${String(n)}`,
  message: "Please update.",
  status,
  raisedAt: "2026-09-29T05:00:00.000Z",
  resolvedAt: null,
});

const REWARDS: RewardsMapResponse = {
  creditPoints: 3,
  milestones: [
    {
      milestoneId: "0190a000-0000-7000-8000-000000000201",
      levelNumber: 1,
      pointsRequired: 5,
      title: "Silver Scroll",
      message: "",
      unlockedAt: null,
      seenAt: null,
    },
  ],
};

function setData({
  unread = 0,
  issues = [] as IssueSummary[],
  queries = [] as QueryRow[],
  nextCursor = null as string | null,
  rewards = REWARDS,
} = {}) {
  vi.mocked(fetchIssueUnreadCount).mockResolvedValue({ count: unread });
  vi.mocked(fetchOwnIssues).mockResolvedValue({
    items: issues,
    nextCursor: null,
  });
  vi.mocked(fetchOwnQueries).mockResolvedValue({
    items: queries,
    nextCursor,
  });
  vi.mocked(fetchRewardsMap).mockResolvedValue(rewards);
}

function renderLanding() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LandingPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(fetchWorkspaceNav).mockResolvedValue(NAV);
  });

  it("leads with what's waiting, then lists it: replies, progress, pending queries", async () => {
    setData({
      unread: 1,
      issues: [issue({}), issue({ id: "0190a000-0000-7000-8000-000000000102", unread: false })],
      queries: [query("pending"), query("approved"), query("pending")],
    });
    renderLanding();

    expect(
      await screen.findByText("1 reply from an admin. 2 queries awaiting review."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Replies for you" })).toBeInTheDocument();
    // Only the unread request is listed, and it links to its thread.
    expect(screen.getByRole("link", { name: /Muthoot Finance is missing/ })).toHaveAttribute(
      "href",
      "/user/help/0190a000-0000-7000-8000-000000000101",
    );
    expect(await screen.findByText("3 of 5 toward Silver Scroll")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Awaiting review" })).toBeInTheDocument();
    expect(screen.getAllByText(/^Raised /)).toHaveLength(2);
    expect(screen.getByRole("link", { name: "New lookup" })).toHaveAttribute(
      "href",
      "/user/workspace",
    );
  });

  it("with nothing waiting, draws no empty sections and points at the task", async () => {
    setData();
    renderLanding();
    expect(await screen.findByText("3 of 5 toward Silver Scroll")).toBeInTheDocument();
    expect(
      screen.getByText("Choose a bank, loan type and status to see where a loan stands."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Replies for you" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Awaiting review" })).not.toBeInTheDocument();
    expect(screen.queryByText(/awaiting review\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/from an admin/)).not.toBeInTheDocument();
  });

  it("offers recent lookups when there are some", async () => {
    setData();
    window.localStorage.setItem(
      `wtc.recent.v1.${USER_ID}`,
      JSON.stringify([{ bankId: B, loanTypeId: LT, statusId: ST, at: new Date().toISOString() }]),
    );
    renderLanding();
    expect(
      await screen.findByText("Pick up a recent lookup, or start a new one."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /HDFC Bank · Home Loan/ })).toHaveAttribute(
      "href",
      `/user/workspace?bank=${B}&loanType=${LT}&status=${ST}`,
    );
  });

  it("doesn't state a pending count it can't vouch for: more pages means no number", async () => {
    setData({ queries: [query("pending")], nextCursor: "next" });
    renderLanding();
    expect(await screen.findByText("Queries awaiting review.")).toBeInTheDocument();
  });

  it("one failing section says so on its own; the rest still render", async () => {
    setData({ queries: [query("pending")] });
    vi.mocked(fetchOwnIssues).mockRejectedValue(new Error("down"));
    renderLanding();
    expect(await screen.findByText(/Couldn't load your help requests\./)).toBeInTheDocument();
    expect(await screen.findByText("3 of 5 toward Silver Scroll")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Awaiting review" })).toBeInTheDocument();
  });

  it("at zero points, says how points are earned; with every milestone reached, says that", async () => {
    setData({ rewards: { ...REWARDS, creditPoints: 0 } });
    const first = renderLanding();
    expect(await screen.findByText("0 of 5 toward Silver Scroll")).toBeInTheDocument();
    expect(screen.getByText("Each query an admin approves earns 1 point.")).toBeInTheDocument();
    first.unmount();

    setData({
      rewards: {
        creditPoints: 6,
        milestones: REWARDS.milestones.map((m) => ({ ...m, unlockedAt: "2026-09-28T06:00:00Z" })),
      },
    });
    renderLanding();
    expect(await screen.findByText("Every milestone unlocked.")).toBeInTheDocument();
  });
});
