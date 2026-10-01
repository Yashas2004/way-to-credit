import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { KnowledgeBasePage } from "./KnowledgeBasePage";

vi.mock("../../lib/auth", () => ({
  useAuth: () => ({
    identity: { id: "admin-self", role: "admin", identifier: "admin1", displayName: "Admin User" },
  }),
}));

vi.mock("../../lib/adminApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/adminApi")>("../../lib/adminApi");
  return {
    ...actual,
    fetchBanks: vi.fn(),
    fetchLoanTypesForBank: vi.fn(),
    fetchDescriptionGrid: vi.fn(),
    fetchDescriptionCoverage: vi.fn(),
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
  fetchDescriptionCoverage,
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
const mockFetchCoverage = vi.mocked(fetchDescriptionCoverage);
const NO_COVERAGE = { totalStatuses: 0, pairCount: 0, missingTotal: 0, pairs: [] };

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

function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("expected at least one element");
  return item;
}

function renderPage(staleTime = 0) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime }, mutations: { retry: false } },
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
  beforeEach(() => {
    window.localStorage.clear();
    mockFetchCoverage.mockResolvedValue(NO_COVERAGE);
  });
  afterEach(() => {
    mockFetchBanks.mockReset();
    mockFetchLoanTypesForBank.mockReset();
    mockFetchDescriptionGrid.mockReset();
    mockUpsertDescription.mockReset();
    mockDeleteBank.mockReset();
    mockFetchStatuses.mockReset();
    mockFetchCoverage.mockReset();
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

  describe("before a pair is open", () => {
    const GRID = {
      wired: true,
      rows: [
        {
          statusId: "st-1",
          statusName: "Login",
          sortOrder: 1,
          body: "NA",
          updatedAt: null,
          updatedBy: null,
        },
      ],
    };
    const COVERAGE = {
      totalStatuses: 50,
      pairCount: 2,
      missingTotal: 70,
      pairs: [
        {
          bankId: "bank-1",
          bankName: "Bank A",
          loanTypeId: "lt-1",
          loanTypeName: "Home Loan",
          filled: 0,
          missing: 50,
        },
        {
          bankId: "bank-1",
          bankName: "Bank A",
          loanTypeId: "lt-2",
          loanTypeName: "Car Loan",
          filled: 30,
          missing: 20,
        },
      ],
    };

    it("lists where descriptions are missing, worst first, and opens a pair in one click", async () => {
      mockFetchBanks.mockResolvedValue([BANK]);
      mockFetchLoanTypesForBank.mockResolvedValue([LOAN_TYPE]);
      mockFetchCoverage.mockResolvedValue(COVERAGE);
      mockFetchDescriptionGrid.mockResolvedValue(GRID);
      renderPage();

      expect(
        await screen.findByRole("heading", { name: "Where descriptions are missing" }),
      ).toBeInTheDocument();
      expect(screen.getByText("70 missing across 2 pairs · 50 statuses each")).toBeInTheDocument();
      const rows = screen.getAllByRole("button", { name: /missing$/ });
      expect(rows.map((r) => r.textContent)).toEqual([
        "Bank A · Home Loan50 of 50 missing",
        "Bank A · Car Loan20 of 50 missing",
      ]);
      expect(mockFetchCoverage).toHaveBeenCalledWith({ limit: 10 });

      fireEvent.click(first(rows));
      await waitFor(() => {
        expect(mockFetchDescriptionGrid).toHaveBeenCalledWith("bank-1", "lt-1");
      });
      // The list makes way for the grid.
      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: "Where descriptions are missing" }),
        ).not.toBeInTheDocument();
      });
    });

    it("with a bank chosen, ranks that bank's loan types", async () => {
      mockFetchBanks.mockResolvedValue([BANK]);
      mockFetchLoanTypesForBank.mockResolvedValue([LOAN_TYPE]);
      mockFetchCoverage.mockResolvedValue(COVERAGE);
      renderPage();
      await screen.findByRole("option", { name: "Bank A" });
      fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "bank-1" } });
      await waitFor(() => {
        expect(mockFetchCoverage).toHaveBeenCalledWith({ bankId: "bank-1", limit: 10 });
      });
      expect(
        await screen.findByRole("heading", { name: "Bank A: loan types, most missing first" }),
      ).toBeInTheDocument();
    });

    it("draws nothing when there are no pairs, rather than an empty box", async () => {
      mockFetchBanks.mockResolvedValue([BANK]);
      renderPage();
      await screen.findByRole("option", { name: "Bank A" });
      await waitFor(() => {
        expect(mockFetchCoverage).toHaveBeenCalled();
      });
      expect(
        screen.queryByRole("heading", { name: "Where descriptions are missing" }),
      ).not.toBeInTheDocument();
    });

    it("offers to reopen the last pair this admin worked on", async () => {
      window.localStorage.setItem(
        "wtc.kb.lastPair.v1.admin-self",
        JSON.stringify({ bankId: "bank-1", loanTypeId: "lt-1" }),
      );
      mockFetchBanks.mockResolvedValue([BANK]);
      mockFetchLoanTypesForBank.mockResolvedValue([LOAN_TYPE]);
      mockFetchDescriptionGrid.mockResolvedValue(GRID);
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: "Reopen Bank A · Home Loan" }));
      await waitFor(() => {
        expect(mockFetchDescriptionGrid).toHaveBeenCalledWith("bank-1", "lt-1");
      });
    });

    // The app caches queries for 30 s (lib/queryClient.ts), so without the
    // invalidation, going back to the list straight after a save would still
    // show the old gaps. The list isn't mounted while a pair is open, so the
    // refetch happens when it's shown again.
    it("shows fresh coverage on returning to the list after a save", async () => {
      mockFetchBanks.mockResolvedValue([BANK]);
      mockFetchLoanTypesForBank.mockResolvedValue([LOAN_TYPE]);
      mockFetchCoverage.mockResolvedValue(COVERAGE);
      mockFetchDescriptionGrid.mockResolvedValue(GRID);
      mockUpsertDescription.mockResolvedValue({});
      renderPage(30_000);
      fireEvent.click(first(await screen.findAllByRole("button", { name: /missing$/ })));
      fireEvent.click(await screen.findByRole("button", { name: /NA — click to add/ }));
      const textarea = await screen.findByLabelText<HTMLTextAreaElement>("Description");
      fireEvent.change(textarea, { target: { value: "Now filled in." } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(mockUpsertDescription).toHaveBeenCalled();
      });

      const calls = mockFetchCoverage.mock.calls.length;
      fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "" } }); // back to the list
      await screen.findByRole("heading", { name: "Where descriptions are missing" });
      await waitFor(() => {
        expect(mockFetchCoverage.mock.calls.length).toBeGreaterThan(calls);
      });
    });
  });
});
