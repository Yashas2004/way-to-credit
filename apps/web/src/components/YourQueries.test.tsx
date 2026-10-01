import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { QueryRow, WorkspaceNavResponse } from "@way-to-credit/shared";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { YourQueries } from "./YourQueries";

vi.mock("../lib/userApi", () => ({ fetchOwnQueries: vi.fn() }));
import { fetchOwnQueries } from "../lib/userApi";

const B = "0190a000-0000-7000-8000-00000000000b";
const LT = "0190a000-0000-7000-8000-0000000000a1";
const ST = "0190a000-0000-7000-8000-0000000000c1";
const GONE = "0190a000-0000-7000-8000-0000000000ff";
const NOW = new Date("2026-09-30T06:30:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const NAV: WorkspaceNavResponse = {
  statuses: [{ id: ST, name: "Sanctioned", sortOrder: 1 }],
  loanTypes: [{ id: LT, name: "Home Loan" }],
  banks: [{ id: B, name: "HDFC Bank", loanTypes: [0] }],
};

let n = 0;
const q = (over: Partial<QueryRow>): QueryRow => ({
  id: `0190a000-0000-7000-8000-${String(++n).padStart(12, "0")}`,
  bankId: B,
  loanTypeId: LT,
  statusId: ST,
  bankNameSnapshot: "HDFC Bank",
  loanTypeNameSnapshot: "Home Loan",
  statusNameSnapshot: `Status ${String(n)}`,
  message: "Please update.",
  status: "pending",
  raisedAt: daysAgo(1),
  resolvedAt: null,
  ...over,
});

function renderIt(items: QueryRow[]) {
  vi.mocked(fetchOwnQueries).mockResolvedValue({ items, nextCursor: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <YourQueries nav={NAV} now={NOW} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("YourQueries", () => {
  beforeEach(() => {
    vi.mocked(fetchOwnQueries).mockReset();
  });

  it("shows pending queries and ones approved this week; not older approvals or rejections", async () => {
    renderIt([
      q({ statusNameSnapshot: "Pending one" }),
      q({ statusNameSnapshot: "Recently approved", status: "approved", resolvedAt: daysAgo(1) }),
      q({ statusNameSnapshot: "Approved last month", status: "approved", resolvedAt: daysAgo(30) }),
      q({ statusNameSnapshot: "Rejected", status: "rejected", resolvedAt: daysAgo(1) }),
    ]);
    expect(await screen.findByText("Pending one")).toBeInTheDocument();
    expect(screen.getByText("Pending one").closest("li")).toHaveTextContent(
      "Awaiting review · raised yesterday",
    );
    expect(screen.getByText("Recently approved").closest("li")).toHaveTextContent(
      "Approved yesterday",
    );
    expect(screen.queryByText("Approved last month")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
  });

  it("puts recent approvals before pending queries, so a changed description isn't cut off", async () => {
    renderIt([
      q({ statusNameSnapshot: "Pending 1" }),
      q({ statusNameSnapshot: "Pending 2" }),
      q({ statusNameSnapshot: "Pending 3" }),
      q({ statusNameSnapshot: "Pending 4" }),
      q({ statusNameSnapshot: "Approved", status: "approved", resolvedAt: daysAgo(2) }),
    ]);
    await screen.findByText("Approved");
    const names = screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector(".font-medium")?.textContent);
    expect(names).toEqual(["Approved", "Pending 1", "Pending 2", "Pending 3"]);
  });

  it("links each to its lookup, except a combination that's been withdrawn", async () => {
    renderIt([
      q({ statusNameSnapshot: "Live" }),
      q({ statusNameSnapshot: "Withdrawn", statusId: GONE }),
    ]);
    expect(
      await screen.findByRole("link", { name: "Look up Live at HDFC Bank, Home Loan" }),
    ).toHaveAttribute("href", `/user/workspace?bank=${B}&loanType=${LT}&status=${ST}`);
    expect(screen.queryByRole("link", { name: /Look up Withdrawn/ })).not.toBeInTheDocument();
  });

  it("draws nothing when there's nothing worth looking at again", async () => {
    const { container } = renderIt([q({ status: "rejected", resolvedAt: daysAgo(1) })]);
    await waitFor(() => {
      expect(fetchOwnQueries).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
