import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { QueryRow, WorkspaceNavResponse } from "@way-to-credit/shared";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyQueriesPage } from "./MyQueriesPage";

vi.mock("../../lib/userApi", () => ({
  fetchOwnQueries: vi.fn(),
  fetchWorkspaceNav: vi.fn(),
}));

import { fetchOwnQueries, fetchWorkspaceNav } from "../../lib/userApi";

const B = "0190a000-0000-7000-8000-00000000000b";
const LT = "0190a000-0000-7000-8000-0000000000a1";
const ST = "0190a000-0000-7000-8000-0000000000c1";
const WITHDRAWN = "0190a000-0000-7000-8000-0000000000ff";

const row = (over: Partial<QueryRow>): QueryRow => ({
  id: "0190a000-0000-7000-8000-000000000301",
  bankId: B,
  loanTypeId: LT,
  statusId: ST,
  bankNameSnapshot: "HDFC Bank",
  loanTypeNameSnapshot: "Home Loan",
  statusNameSnapshot: "Sanctioned",
  message: "The sanction letter validity is missing.",
  status: "approved",
  raisedAt: "2026-09-29T05:22:00.000Z",
  resolvedAt: "2026-09-29T06:00:00.000Z",
  ...over,
});

const NAV: WorkspaceNavResponse = {
  statuses: [{ id: ST, name: "Sanctioned", sortOrder: 1 }],
  loanTypes: [{ id: LT, name: "Home Loan" }],
  banks: [{ id: B, name: "HDFC Bank", loanTypes: [0] }],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MyQueriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MyQueriesPage", () => {
  beforeEach(() => {
    vi.mocked(fetchWorkspaceNav).mockResolvedValue(NAV);
  });

  it("shows each query's combination, message, outcome and IST time, with a link to look it up", async () => {
    vi.mocked(fetchOwnQueries).mockResolvedValue({ items: [row({})], nextCursor: null });
    renderPage();

    expect(await screen.findByText("The sanction letter validity is missing.")).toBeInTheDocument();
    expect(screen.getByText("HDFC Bank · Home Loan")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("+1 credit")).toBeInTheDocument();
    expect(screen.getByText(/29 Sept 2026, 10:52 am IST/)).toBeInTheDocument(); // 05:22Z = 10:52 IST
    expect(screen.getByText(/10:52 am IST/)).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Look up Sanctioned at HDFC Bank, Home Loan" }),
    ).toHaveAttribute("href", `/user/workspace?bank=${B}&loanType=${LT}&status=${ST}`);
  });

  it("offers no look-up link for a combination that has since been withdrawn", async () => {
    vi.mocked(fetchOwnQueries).mockResolvedValue({
      items: [
        row({
          id: "0190a000-0000-7000-8000-000000000302",
          statusId: WITHDRAWN,
          statusNameSnapshot: "Old status",
          status: "pending",
        }),
        row({}),
      ],
      nextCursor: null,
    });
    renderPage();
    // The live row's link proves the navigation data has loaded...
    await screen.findByRole("link", { name: "Look up Sanctioned at HDFC Bank, Home Loan" });
    // ...so the withdrawn row's missing link is a decision, not a race.
    expect(screen.getAllByRole("link", { name: /^Look up/ })).toHaveLength(1);
    expect(screen.getByText("Old status")).toBeInTheDocument();
  });
});
