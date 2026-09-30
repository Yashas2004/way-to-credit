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
  it("names every actor from the server, other admins included; the viewer is marked '(you)'", async () => {
    const base = { event: "login" as const, ip: null, userAgent: null, actorArchived: false };
    vi.mocked(fetchActivityLog).mockResolvedValue({
      items: [
        {
          ...base,
          id: "a1",
          actorId: "01a0f18c-0000-7000-8000-00000000000a",
          actorType: "user",
          occurredAt: "2026-01-01T05:00:00.000Z",
          actorName: "Ramesh Kumar",
          actorHandle: "user1",
        },
        {
          ...base,
          id: "a2",
          actorId: "admin-other",
          actorType: "admin",
          occurredAt: "2026-01-01T04:30:00.000Z",
          actorName: "Meera Iyer",
          actorHandle: "admin2",
        },
        {
          ...base,
          id: "a3",
          actorId: "admin-self",
          actorType: "admin",
          occurredAt: "2026-01-01T04:00:00.000Z",
          actorName: "Admin User",
          actorHandle: "admin1",
        },
      ],
      nextCursor: null,
    });
    renderWithPending(0);
    expect(await screen.findByText("Ramesh Kumar")).toBeInTheDocument();
    expect(screen.getByText("Meera Iyer")).toBeInTheDocument();
    expect(screen.getByText("Admin User (you)")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("01a0f18c");
  });
});
