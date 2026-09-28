import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminIssueSummary } from "@way-to-credit/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelpInboxPage } from "./HelpInboxPage";

vi.mock("../../lib/adminApi", () => ({ fetchAdminIssues: vi.fn(), fetchUsers: vi.fn() }));
import { fetchAdminIssues, fetchUsers } from "../../lib/adminApi";

const mockIssues = vi.mocked(fetchAdminIssues);
vi.mocked(fetchUsers).mockResolvedValue([]);

function issue(
  id: string,
  subject: string,
  extra: Partial<AdminIssueSummary> = {},
): AdminIssueSummary {
  return {
    id,
    subject,
    status: "awaiting_admin",
    openedAt: "2026-10-01T06:30:00.000Z",
    lastActivityAt: "2026-10-01T06:30:00.000Z",
    resolvedAt: null,
    unread: false,
    raisedBy: "u1",
    raisedByUserId: "user1",
    raisedByDisplayName: "Ramesh Kumar",
    ...extra,
  };
}

function renderInbox(url = "/admin/help") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <HelpInboxPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("HelpInboxPage", () => {
  beforeEach(() => {
    mockIssues.mockReset();
  });

  it("renders a request that appears on two pages exactly once", async () => {
    mockIssues
      .mockResolvedValueOnce({
        items: [issue("a", "Alpha"), issue("b", "Bravo")],
        nextCursor: "c1",
      })
      .mockResolvedValueOnce({
        items: [issue("b", "Bravo"), issue("c", "Charlie")],
        nextCursor: null,
      });
    renderInbox();

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Charlie")).toBeInTheDocument();

    expect(screen.getAllByTestId("issue-row")).toHaveLength(3);
    expect(screen.getAllByText("Bravo")).toHaveLength(1);
  });

  it("takes its status filter from the URL, so the dashboard can link to 'needs a reply'", async () => {
    mockIssues.mockResolvedValue({ items: [], nextCursor: null });
    renderInbox("/admin/help?status=awaiting_admin");
    await waitFor(() => {
      expect(mockIssues).toHaveBeenCalledWith(
        expect.objectContaining({ status: "awaiting_admin" }),
      );
    });
  });

  it("marks unread with text and weight, and words status from the admin's side", async () => {
    mockIssues.mockResolvedValue({
      items: [
        issue("a", "Alpha", { unread: true }),
        issue("b", "Bravo", { status: "awaiting_user" }),
      ],
      nextCursor: null,
    });
    renderInbox();
    expect(await screen.findByText("Unread:")).toBeInTheDocument();
    expect(screen.getByText(/New message/)).toBeInTheDocument();
    // Scoped to the rows: the status filter's options use the same words.
    const [first, second] = screen.getAllByTestId("issue-row");
    if (!first || !second) throw new Error("expected two rows");
    expect(within(first).getByText("Needs a reply")).toBeInTheDocument();
    expect(within(second).getByText("Waiting for the user")).toBeInTheDocument();
  });
});
