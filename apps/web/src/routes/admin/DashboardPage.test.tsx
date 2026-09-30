import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

vi.mock("../../lib/auth", () => ({
  useAuth: () => ({
    identity: { id: "admin-self", role: "admin", identifier: "admin1", displayName: "Admin User" },
  }),
}));

vi.mock("../../lib/adminApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/adminApi")>("../../lib/adminApi");
  return {
    ...actual,
    fetchStats: vi.fn(),
    fetchActivityLog: vi.fn(),
    fetchUsers: vi.fn(),
    fetchAdminQueries: vi.fn(),
  };
});

import { fetchActivityLog, fetchAdminQueries, fetchStats, fetchUsers } from "../../lib/adminApi";

const mockFetchStats = vi.mocked(fetchStats);
vi.mocked(fetchActivityLog).mockResolvedValue({ items: [], nextCursor: null });
vi.mocked(fetchUsers).mockResolvedValue([]);
vi.mocked(fetchAdminQueries).mockResolvedValue({ items: [], nextCursor: null });

function renderWithPending(pendingQueryCount: number, awaitingAdminIssueCount = 0) {
  mockFetchStats.mockResolvedValue({
    totalUsers: 3,
    activeUsersLast5Minutes: 0,
    totalBanks: 4,
    pendingQueryCount,
    awaitingAdminIssueCount,
    totalCreditsIssued: 5,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardPage pending-query count", () => {
  afterEach(() => {
    mockFetchStats.mockReset();
  });

  it("is neutral, not amber, when nothing is pending", async () => {
    renderWithPending(0);
    const count = await screen.findByTestId("pending-query-count");
    expect(count).toHaveTextContent("0");
    expect(count.className).toContain("text-ink");
    expect(count.className).not.toContain("text-attention");
  });

  it("is amber when queries are waiting on an admin", async () => {
    renderWithPending(2);
    const count = await screen.findByTestId("pending-query-count");
    expect(count).toHaveTextContent("2");
    expect(count.className).toContain("text-attention");
  });

  it("shows help requests awaiting a reply beside pending queries: amber only when non-zero, linking to that filter", async () => {
    renderWithPending(0, 3);
    const count = await screen.findByTestId("awaiting-issue-count");
    expect(count).toHaveTextContent("3");
    expect(count.className).toContain("text-attention");
    expect(count.closest("a")).toHaveAttribute("href", "/admin/help?status=awaiting_admin");
  });

  it("shows zero help requests awaiting a reply as neutral", async () => {
    renderWithPending(0, 0);
    const count = await screen.findByTestId("awaiting-issue-count");
    expect(count.className).toContain("text-ink");
    expect(count.className).not.toContain("text-attention");
  });
});

describe("DashboardPage recent activity", () => {
  it("names each actor instead of showing an id fragment; the viewing admin is 'You'", async () => {
    const userId = "01a0f18c-0000-7000-8000-00000000000a";
    vi.mocked(fetchUsers).mockResolvedValue([
      {
        id: userId,
        userId: "user1",
        displayName: "Ramesh Kumar",
        creditPoints: 0,
        isActive: true,
        lastSeenAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        archivedAt: null,
      },
    ]);
    vi.mocked(fetchActivityLog).mockResolvedValue({
      items: [
        {
          id: "a1",
          actorId: userId,
          actorType: "user",
          event: "login",
          occurredAt: "2026-01-01T05:00:00.000Z",
          ip: null,
          userAgent: null,
        },
        {
          id: "a2",
          actorId: "admin-self",
          actorType: "admin",
          event: "login",
          occurredAt: "2026-01-01T04:00:00.000Z",
          ip: null,
          userAgent: null,
        },
      ],
      nextCursor: null,
    });
    renderWithPending(0);
    expect(await screen.findByText("Ramesh Kumar")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByText(/01a0f18c/)).not.toBeInTheDocument();
  });
});
