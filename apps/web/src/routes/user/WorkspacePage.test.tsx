import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkspaceNavResponse } from "@way-to-credit/shared";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { WorkspacePage } from "./WorkspacePage";

vi.mock("../../lib/userApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/userApi")>("../../lib/userApi");
  return {
    ...actual,
    fetchWorkspaceNav: vi.fn(),
    fetchDescription: vi.fn(),
  };
});

import { fetchDescription, fetchWorkspaceNav } from "../../lib/userApi";

const mockFetchNav = vi.mocked(fetchWorkspaceNav);
const mockFetchDescription = vi.mocked(fetchDescription);

// Statuses are global (one list), loan types are listed once, and each bank
// offers loan types by index into that list.
const TREE: WorkspaceNavResponse = {
  statuses: [
    { id: "st-sanctioned", name: "Sanctioned", sortOrder: 2 },
    { id: "st-login", name: "Login", sortOrder: 1 },
  ],
  loanTypes: [
    { id: "lt-b1", name: "Car Loan" },
    { id: "lt-a1", name: "Home Loan" },
  ],
  banks: [
    { id: "bank-a", name: "Bank A", loanTypes: [1] },
    { id: "bank-b", name: "Bank B", loanTypes: [0] },
  ],
};

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <WorkspacePage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WorkspacePage", () => {
  it("loads the tree once and fires no further tree requests while narrowing", async () => {
    mockFetchNav.mockResolvedValue(TREE);
    mockFetchDescription.mockResolvedValue({ body: "Some description" });

    renderWorkspace();

    await screen.findByLabelText("Bank");
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-a" } });
    fireEvent.change(await screen.findByLabelText("Loan type"), {
      target: { value: "lt-a1" },
    });
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "st-login" },
    });

    await waitFor(() => {
      expect(mockFetchDescription).toHaveBeenCalledTimes(1);
    });
    expect(mockFetchNav).toHaveBeenCalledTimes(1);
  });

  it("orders statuses by sortOrder and resets loan type and status when the bank changes", async () => {
    mockFetchNav.mockResolvedValue(TREE);
    mockFetchDescription.mockResolvedValue({ body: "Some description" });

    renderWorkspace();

    await screen.findByLabelText("Bank");
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-a" } });
    fireEvent.change(await screen.findByLabelText("Loan type"), {
      target: { value: "lt-a1" },
    });

    const statusOptions = screen.getAllByRole("option", { name: /step \d of 2/ });
    expect(statusOptions.map((o) => o.textContent)).toEqual([
      "Login — step 1 of 2",
      "Sanctioned — step 2 of 2",
    ]);

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "st-login" } });
    expect(screen.getByLabelText<HTMLSelectElement>("Status").value).toBe("st-login");

    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-b" } });

    expect(screen.getByLabelText<HTMLSelectElement>("Loan type").value).toBe("");
    expect(screen.getByLabelText<HTMLSelectElement>("Status").value).toBe("");
    expect(screen.getByLabelText<HTMLSelectElement>("Status")).toBeDisabled();
  });

  // Regression: a bank with nothing attached rendered a silently empty
  // Loan type dropdown, indistinguishable from a broken one.
  it("says plainly when the chosen bank has no loan types attached yet", async () => {
    mockFetchNav.mockResolvedValue({
      ...TREE,
      banks: [...TREE.banks, { id: "bank-new", name: "Brand New Bank", loanTypes: [] }],
    });

    renderWorkspace();

    await screen.findByRole("option", { name: "Brand New Bank" });
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-new" } });

    expect(screen.getByText("This bank has no loan types attached yet.")).toBeInTheDocument();
    expect(screen.getByLabelText("Loan type")).toBeDisabled();
  });

  it("shows the NA state distinctly from a real description", async () => {
    mockFetchNav.mockResolvedValue(TREE);
    mockFetchDescription.mockResolvedValue({ body: "NA" });

    renderWorkspace();

    await screen.findByLabelText("Bank");
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-b" } });
    fireEvent.change(await screen.findByLabelText("Loan type"), {
      target: { value: "lt-b1" },
    });
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "st-login" },
    });

    expect(
      await screen.findByText("No description has been added for this status yet."),
    ).toBeInTheDocument();

    mockFetchDescription.mockResolvedValue({ body: "Loan fully repaid and account closed." });
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-a" } });
    fireEvent.change(await screen.findByLabelText("Loan type"), {
      target: { value: "lt-a1" },
    });
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "st-login" },
    });

    expect(await screen.findByText("Loan fully repaid and account closed.")).toBeInTheDocument();
    expect(
      screen.queryByText("No description has been added for this status yet."),
    ).not.toBeInTheDocument();
    // Says what a query is for, and points everything else to help requests.
    expect(
      screen.getByText(/if an admin approves it, you earn a credit point/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ask for help" })).toHaveAttribute(
      "href",
      "/user/help",
    );
  });

  it("fails fast on a navigation error: no retry, even where the app's default would retry", async () => {
    mockFetchNav.mockReset();
    mockFetchNav.mockRejectedValue(new Error("timeout"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 3 } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ToastProvider>
            <WorkspacePage />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText(/couldn't load the bank and loan type list/i),
    ).toBeInTheDocument();
    expect(mockFetchNav).toHaveBeenCalledTimes(1);
  });
});
