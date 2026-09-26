import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { KnowledgeBasePage } from "./KnowledgeBasePage";

vi.mock("../../lib/adminApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/adminApi")>("../../lib/adminApi");
  return {
    ...actual,
    fetchBanks: vi.fn(),
    fetchLoanTypesForBank: vi.fn(),
    fetchDescriptionGrid: vi.fn(),
    upsertDescription: vi.fn(),
    fetchLoanTypes: vi.fn(),
    createBank: vi.fn(),
    renameBank: vi.fn(),
    deleteBank: vi.fn(),
    undeleteBank: vi.fn(),
    createLoanType: vi.fn(),
    renameLoanType: vi.fn(),
    deleteLoanType: vi.fn(),
    undeleteLoanType: vi.fn(),
    attachLoanType: vi.fn(),
    detachLoanType: vi.fn(),
    fetchStatuses: vi.fn(),
    createStatus: vi.fn(),
    updateStatus: vi.fn(),
    deleteStatus: vi.fn(),
    undeleteStatus: vi.fn(),
  };
});

import {
  deleteBank,
  fetchBanks,
  fetchDescriptionGrid,
  fetchLoanTypesForBank,
  fetchStatuses,
  upsertDescription,
} from "../../lib/adminApi";

const mockFetchStatuses = vi.mocked(fetchStatuses);

const mockFetchBanks = vi.mocked(fetchBanks);
const mockFetchLoanTypesForBank = vi.mocked(fetchLoanTypesForBank);
const mockFetchDescriptionGrid = vi.mocked(fetchDescriptionGrid);
const mockUpsertDescription = vi.mocked(upsertDescription);
const mockDeleteBank = vi.mocked(deleteBank);

const BANK = {
  id: "bank-1",
  name: "Bank A",
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const LOAN_TYPE = {
  id: "lt-1",
  name: "Home Loan",
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <KnowledgeBasePage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("KnowledgeBasePage", () => {
  afterEach(() => {
    mockFetchBanks.mockReset();
    mockFetchLoanTypesForBank.mockReset();
    mockFetchDescriptionGrid.mockReset();
    mockUpsertDescription.mockReset();
    mockDeleteBank.mockReset();
    mockFetchStatuses.mockReset();
  });

  // Not a modal, so the focus-trap fix doesn't cover it: the first keystroke
  // here flips the unsaved flag, which re-renders the whole page — this
  // checks that re-render never remounts the textarea mid-typing.
  it("editable cell keeps focus while typing several characters", async () => {
    mockFetchBanks.mockResolvedValue([BANK]);
    mockFetchLoanTypesForBank.mockResolvedValue([LOAN_TYPE]);
    mockFetchDescriptionGrid.mockResolvedValue({
      wired: true,
      rows: [
        {
          statusId: "st-1",
          statusName: "Login",
          sortOrder: 1,
          body: "Old text",
          updatedAt: null,
          updatedBy: null,
        },
      ],
    });

    renderPage();
    await screen.findByRole("option", { name: "Bank A" });
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-1" } });
    await screen.findByRole("option", { name: "Home Loan" });
    fireEvent.change(screen.getByLabelText("Loan type"), { target: { value: "lt-1" } });
    fireEvent.click(await screen.findByRole("button", { name: "Old text" }));

    const textarea = await screen.findByLabelText<HTMLTextAreaElement>("Description");
    expect(document.activeElement).toBe(textarea);
    for (const value of ["N", "Ne", "New", "New text"]) {
      fireEvent.change(textarea, { target: { value } });
      expect(document.activeElement).toBe(textarea);
      expect(screen.getByLabelText("Description")).toBe(textarea); // same node, never remounted
    }
    expect(screen.getByText(/Unsaved/)).toBeInTheDocument();
  });

  it("summarises the pair as a total status count plus how many still need a description", async () => {
    mockFetchBanks.mockResolvedValue([BANK]);
    mockFetchLoanTypesForBank.mockResolvedValue([LOAN_TYPE]);
    mockFetchDescriptionGrid.mockResolvedValue({
      wired: true,
      rows: [
        {
          statusId: "st-1",
          statusName: "Login",
          sortOrder: 1,
          body: "Text",
          updatedAt: null,
          updatedBy: null,
        },
        {
          statusId: "st-2",
          statusName: "Sanctioned",
          sortOrder: 2,
          body: "NA",
          updatedAt: null,
          updatedBy: null,
        },
        {
          statusId: "st-3",
          statusName: "Closed",
          sortOrder: 3,
          body: "NA",
          updatedAt: null,
          updatedBy: null,
        },
      ],
    });

    renderPage();
    await screen.findByRole("option", { name: "Bank A" });
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-1" } });
    await screen.findByRole("option", { name: "Home Loan" });
    fireEvent.change(screen.getByLabelText("Loan type"), { target: { value: "lt-1" } });

    expect(await screen.findByText(/3 statuses · 2 still need a description/)).toBeInTheDocument();
    expect(screen.queryByText(/still marked NA/)).not.toBeInTheDocument();
  });

  it("the catalog's Statuses tab shows each name without the internal sort-order number", async () => {
    mockFetchBanks.mockResolvedValue([BANK]);
    mockFetchStatuses.mockResolvedValue([
      {
        id: "st-1",
        name: "Sanctioned",
        sortOrder: 4,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Manage catalog" }));
    const catalog = await screen.findByRole("dialog", { name: "Manage catalog" });
    fireEvent.click(within(catalog).getByRole("button", { name: "Statuses" }));

    expect(await within(catalog).findByText("Sanctioned")).toBeInTheDocument();
    expect(within(catalog).queryByText(/order 4/)).not.toBeInTheDocument();
    expect(within(catalog).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("loads a bank+loan-type pair and saves an edited description via PUT, toasting success", async () => {
    mockFetchBanks.mockResolvedValue([BANK]);
    mockFetchLoanTypesForBank.mockResolvedValue([LOAN_TYPE]);
    mockFetchDescriptionGrid.mockResolvedValue({
      wired: true,
      rows: [
        {
          statusId: "st-1",
          statusName: "Login",
          sortOrder: 1,
          body: "Old text",
          updatedAt: "2026-01-01T00:00:00.000Z",
          updatedBy: "admin-1",
        },
      ],
    });
    mockUpsertDescription.mockResolvedValue(undefined);

    renderPage();

    // Wait for each select's real option to land before choosing it — the
    // select itself exists (and findByLabelText resolves) before its async
    // data does, so firing change any earlier targets a value with no
    // matching <option> yet.
    await screen.findByRole("option", { name: "Bank A" });
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-1" } });
    await screen.findByRole("option", { name: "Home Loan" });
    fireEvent.change(screen.getByLabelText("Loan type"), { target: { value: "lt-1" } });

    const cell = await screen.findByRole("button", { name: "Old text" });
    fireEvent.click(cell);

    const textarea = await screen.findByLabelText("Description");
    fireEvent.change(textarea, { target: { value: "New text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpsertDescription).toHaveBeenCalledWith({
        bankId: "bank-1",
        loanTypeId: "lt-1",
        statusId: "st-1",
        body: "New text",
      });
    });
    expect(await screen.findByText("Description saved.")).toBeInTheDocument();
  });

  it("shows the server's exact HAS_DEPENDENT_DESCRIPTIONS message when a catalog delete is blocked, not a generic failure", async () => {
    mockFetchBanks.mockResolvedValue([BANK]);
    mockDeleteBank.mockRejectedValue(
      new ApiError(
        "HAS_DEPENDENT_DESCRIPTIONS",
        "Cannot delete: 3 live description(s) still reference this bank.",
        409,
      ),
    );

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Manage catalog" }));

    const catalogDialog = await screen.findByRole("dialog", { name: "Manage catalog" });
    fireEvent.click(await within(catalogDialog).findByRole("button", { name: "Delete" }));

    const confirmDialog = await screen.findByRole("dialog", { name: "Delete bank" });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("Cannot delete: 3 live description(s) still reference this bank."),
    ).toBeInTheDocument();
  });
});
