import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HelpListPage } from "./HelpListPage";

vi.mock("../../lib/userApi", () => ({ fetchOwnIssues: vi.fn(), createIssue: vi.fn() }));
import { fetchOwnIssues } from "../../lib/userApi";

const mockFetch = vi.mocked(fetchOwnIssues);

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HelpListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const base = {
  openedAt: "2026-10-01T06:30:00.000Z",
  lastActivityAt: "2026-10-01T06:30:00.000Z",
  resolvedAt: null,
};

describe("HelpListPage", () => {
  it("explains what help requests are for, and marks unread with text, not just weight", async () => {
    mockFetch.mockResolvedValue({
      items: [
        { ...base, id: "i1", subject: "Can't see my bank", status: "awaiting_user", unread: true },
        { ...base, id: "i2", subject: "Password question", status: "resolved", unread: false },
      ],
      nextCursor: null,
    });
    renderPage();

    expect(
      screen.getByText(/trouble with the portal, your account, or a question for the admin team/),
    ).toBeInTheDocument();
    expect(await screen.findByText("Can't see my bank")).toBeInTheDocument();
    expect(screen.getByText("New reply:")).toBeInTheDocument(); // screen-reader prefix
    expect(screen.getAllByText(/New reply/)).toHaveLength(2); // prefix + visible meta
    expect(screen.getByText("Needs your reply")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("the new-request form points description problems back to raising a query", async () => {
    mockFetch.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Ask for help" }));
    expect(
      screen.getByRole("link", { name: "Raise a query from that description instead" }),
    ).toHaveAttribute("href", "/user/workspace");
  });
});
