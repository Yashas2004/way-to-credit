import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { UserTreeResponse } from "@way-to-credit/shared";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { WorkspacePage } from "./WorkspacePage";

vi.mock("../../lib/userApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/userApi")>("../../lib/userApi");
  return {
    ...actual,
    fetchUserTree: vi.fn(),
    fetchDescription: vi.fn(),
  };
});

import { fetchDescription, fetchUserTree } from "../../lib/userApi";

const mockFetchUserTree = vi.mocked(fetchUserTree);
const mockFetchDescription = vi.mocked(fetchDescription);

const TREE: UserTreeResponse = [
  {
    bankId: "bank-a",
    bankName: "Bank A",
    loanTypes: [
      {
        loanTypeId: "lt-a1",
        loanTypeName: "Home Loan",
        statuses: [
          { statusId: "st-a1-2", statusName: "Sanctioned", sortOrder: 2 },
          { statusId: "st-a1-1", statusName: "Login", sortOrder: 1 },
        ],
      },
    ],
  },
  {
    bankId: "bank-b",
    bankName: "Bank B",
    loanTypes: [
      {
        loanTypeId: "lt-b1",
        loanTypeName: "Car Loan",
        statuses: [{ statusId: "st-b1-1", statusName: "Closed", sortOrder: 1 }],
      },
    ],
  },
];

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <WorkspacePage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("WorkspacePage", () => {
  it("loads the tree once and fires no further tree requests while narrowing", async () => {
    mockFetchUserTree.mockResolvedValue(TREE);
    mockFetchDescription.mockResolvedValue({ body: "Some description" });

    renderWorkspace();

    await screen.findByLabelText("Bank");
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-a" } });
    fireEvent.change(await screen.findByLabelText("Loan type"), {
      target: { value: "lt-a1" },
    });
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "st-a1-1" },
    });

    await waitFor(() => {
      expect(mockFetchDescription).toHaveBeenCalledTimes(1);
    });
    expect(mockFetchUserTree).toHaveBeenCalledTimes(1);
  });

  it("orders statuses by sortOrder and resets loan type and status when the bank changes", async () => {
    mockFetchUserTree.mockResolvedValue(TREE);
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

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "st-a1-1" } });
    expect(screen.getByLabelText<HTMLSelectElement>("Status").value).toBe("st-a1-1");

    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-b" } });

    expect(screen.getByLabelText<HTMLSelectElement>("Loan type").value).toBe("");
    expect(screen.getByLabelText<HTMLSelectElement>("Status").value).toBe("");
    expect(screen.getByLabelText<HTMLSelectElement>("Status")).toBeDisabled();
  });

  it("shows the NA state distinctly from a real description", async () => {
    mockFetchUserTree.mockResolvedValue(TREE);
    mockFetchDescription.mockResolvedValue({ body: "NA" });

    renderWorkspace();

    await screen.findByLabelText("Bank");
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-b" } });
    fireEvent.change(await screen.findByLabelText("Loan type"), {
      target: { value: "lt-b1" },
    });
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "st-b1-1" },
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
      target: { value: "st-a1-1" },
    });

    expect(await screen.findByText("Loan fully repaid and account closed.")).toBeInTheDocument();
    expect(
      screen.queryByText("No description has been added for this status yet."),
    ).not.toBeInTheDocument();
  });
});
