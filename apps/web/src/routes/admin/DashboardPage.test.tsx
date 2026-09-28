import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

vi.mock("../../lib/adminApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/adminApi")>("../../lib/adminApi");
  return {
    ...actual,
    fetchStats: vi.fn(),
    fetchActivityLog: vi.fn(),
    fetchAdminQueries: vi.fn(),
  };
});

import { fetchActivityLog, fetchAdminQueries, fetchStats } from "../../lib/adminApi";

const mockFetchStats = vi.mocked(fetchStats);
vi.mocked(fetchActivityLog).mockResolvedValue({ items: [], nextCursor: null });
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
