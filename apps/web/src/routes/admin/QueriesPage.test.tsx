import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AdminQueryRow } from "@way-to-credit/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { QueriesPage } from "./QueriesPage";

vi.mock("../../lib/adminApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/adminApi")>("../../lib/adminApi");
  return {
    ...actual,
    fetchAdminQueries: vi.fn(),
    approveQuery: vi.fn(),
    rejectQuery: vi.fn(),
    fetchUsers: vi.fn(),
  };
});

import { approveQuery, fetchAdminQueries, fetchUsers, rejectQuery } from "../../lib/adminApi";

const mockFetchAdminQueries = vi.mocked(fetchAdminQueries);
const mockApproveQuery = vi.mocked(approveQuery);
const mockRejectQuery = vi.mocked(rejectQuery);
const mockFetchUsers = vi.mocked(fetchUsers);

const PENDING_ITEM: AdminQueryRow = {
  id: "q1",
  raisedBy: "user-1",
  bankId: "bank-1",
  loanTypeId: "lt-1",
  statusId: "st-1",
  bankNameSnapshot: "Bank A",
  loanTypeNameSnapshot: "Home Loan",
  statusNameSnapshot: "Login",
  message: "What does this mean?",
  status: "pending",
  raisedAt: "2026-01-01T00:00:00.000Z",
  resolvedAt: null,
  resolvedBy: null,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <QueriesPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("QueriesPage", () => {
  afterEach(() => {
    mockFetchAdminQueries.mockReset();
    mockApproveQuery.mockReset();
    mockRejectQuery.mockReset();
    mockFetchUsers.mockReset();
  });

  it("approves a query non-optimistically from the server's response, disabling both buttons while in flight", async () => {
    mockFetchUsers.mockResolvedValue([]);
    mockFetchAdminQueries.mockResolvedValue({ items: [PENDING_ITEM], nextCursor: null });

    let resolveApprove: (value: AdminQueryRow) => void = () => undefined;
    const approvePromise = new Promise<AdminQueryRow>((resolve) => {
      resolveApprove = resolve;
    });
    mockApproveQuery.mockReturnValue(approvePromise);

    renderPage();

    await screen.findByText("What does this mean?");
    const approveButton = screen.getByRole("button", { name: "Approve (+1 credit)" });
    const rejectButton = screen.getByRole("button", { name: "Reject" });

    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(approveButton).toBeDisabled();
      expect(rejectButton).toBeDisabled();
    });

    resolveApprove({
      ...PENDING_ITEM,
      status: "approved",
      resolvedAt: "2026-01-01T01:00:00.000Z",
      resolvedBy: "admin-1",
    });

    expect(await screen.findByText("Query approved — 1 credit awarded.")).toBeInTheDocument();
    // The row is now resolved — its action buttons are gone, proving the
    // displayed state came from the server's returned row, not an
    // optimistic guess made before the promise settled.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Approve (+1 credit)" })).not.toBeInTheDocument();
    });
    const row = screen.getByText("What does this mean?").closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Approved")).toBeInTheDocument();
  });

  it("shows a specific message and refetches when a query was already resolved by someone else", async () => {
    mockFetchUsers.mockResolvedValue([]);
    mockFetchAdminQueries
      .mockResolvedValueOnce({ items: [PENDING_ITEM], nextCursor: null })
      .mockResolvedValueOnce({
        items: [
          {
            ...PENDING_ITEM,
            status: "rejected",
            resolvedAt: "2026-01-01T01:00:00.000Z",
            resolvedBy: "other-admin",
          },
        ],
        nextCursor: null,
      });
    mockApproveQuery.mockRejectedValue(
      new ApiError("ALREADY_RESOLVED", "This query was already resolved.", 409),
    );

    renderPage();

    await screen.findByText("What does this mean?");
    fireEvent.click(screen.getByRole("button", { name: "Approve (+1 credit)" }));

    expect(
      await screen.findByText("Someone else already resolved this query."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mockFetchAdminQueries).toHaveBeenCalledTimes(2);
    });
  });
});
