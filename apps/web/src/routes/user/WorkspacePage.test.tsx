import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { WorkspaceNavResponse } from "@way-to-credit/shared";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { WorkspacePage } from "./WorkspacePage";

vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ identity: { id: USER_ID, role: "user", identifier: "u1", displayName: "U" } }),
}));

vi.mock("../../lib/userApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/userApi")>("../../lib/userApi");
  return {
    ...actual,
    fetchWorkspaceNav: vi.fn(),
    fetchDescription: vi.fn(),
  };
});

import { ApiError } from "../../lib/api";
import { fetchDescription, fetchWorkspaceNav } from "../../lib/userApi";

const USER_ID = "0190a000-0000-7000-8000-000000000001";

const mockFetchNav = vi.mocked(fetchWorkspaceNav);
const mockFetchDescription = vi.mocked(fetchDescription);

// Statuses are global (one list), loan types are listed once, and each bank
// offers loan types by index into that list.
const NAV: WorkspaceNavResponse = {
  statuses: [
    { id: "st-sanctioned", name: "Sanctioned", sortOrder: 2 },
    { id: "st-login", name: "Login", sortOrder: 1 },
  ],
  loanTypes: [
    { id: "lt-car", name: "Car Loan" },
    { id: "lt-home", name: "HDFC Home Loan" },
  ],
  banks: [
    { id: "bank-a", name: "Bank A", loanTypes: [1] },
    { id: "bank-b", name: "Bank B", loanTypes: [0] },
  ],
};

function renderWorkspace(client?: QueryClient, path = "/user/workspace") {
  const queryClient =
    client ??
    new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <WorkspacePage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const box = (label: string) => screen.getByRole("combobox", { name: label });

function sectionOf(heading: HTMLElement): HTMLElement {
  const section = heading.closest("section");
  if (!section) throw new Error("heading is not in a section");
  return section;
}

/** Type part of a name and press Enter: picks the first match, like a keyboard user. */
function pick(label: string, text: string) {
  const input = box(label);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

async function chooseAll(status = "login") {
  await screen.findByRole("combobox", { name: "Bank" });
  pick("Bank", "bank a");
  pick("Loan type", "home"); // substring: "HDFC Home Loan"
  pick("Status", status);
}

// Each status has its own text, so a neighbour's preview in the lifecycle
// rail never duplicates the main result's text.
const BODIES: Record<string, string> = {
  "st-login": "Loan fully repaid and account closed.",
  "st-sanctioned": "Sanctioned text.",
  "0190a000-0000-7000-8000-0000000000c1": "Login stage text.",
  "0190a000-0000-7000-8000-0000000000c2": "Loan fully repaid and account closed.",
};

/** Lookups of one status: the lifecycle rail also previews the neighbours. */
const callsFor = (statusId: string) =>
  mockFetchDescription.mock.calls.filter((c) => c[2] === statusId).length;

describe("WorkspacePage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetchNav.mockReset();
    mockFetchDescription.mockReset();
    mockFetchNav.mockResolvedValue(NAV);
    mockFetchDescription.mockImplementation((_bank, _loanType, statusId) =>
      Promise.resolve({ body: BODIES[statusId] ?? "Another step." }),
    );
  });

  it("loads nothing until asked: choosing all three fetches no description", async () => {
    renderWorkspace();
    await chooseAll();
    expect(box("Loan type")).toHaveValue("HDFC Home Loan");
    expect(box("Status")).toHaveValue("Login");
    await new Promise((r) => setTimeout(r, 50));
    expect(mockFetchDescription).not.toHaveBeenCalled();
    expect(mockFetchNav).toHaveBeenCalledTimes(1);
  });

  it("shows the description when asked, for exactly the chosen triple", async () => {
    renderWorkspace();
    expect(await screen.findByRole("button", { name: "Show description" })).toBeDisabled();
    await chooseAll();
    fireEvent.click(screen.getByRole("button", { name: "Show description" }));

    expect(await screen.findByText("Loan fully repaid and account closed.")).toBeInTheDocument();
    expect(callsFor("st-login")).toBe(1);
    expect(mockFetchDescription).toHaveBeenCalledWith("bank-a", "lt-home", "st-login");
    expect(screen.getByText("Bank A · HDFC Home Loan")).toBeInTheDocument();
  });

  // The lifecycle rail previews the neighbouring steps, but never at the
  // result's expense: here the neighbour lookups never answer at all.
  it("shows the result even if the neighbouring steps' previews never load", async () => {
    mockFetchDescription.mockImplementation((_bank, _loanType, statusId) =>
      statusId === "st-login"
        ? Promise.resolve({ body: "Loan fully repaid and account closed." })
        : new Promise(() => undefined),
    );
    renderWorkspace();
    await chooseAll();
    fireEvent.click(screen.getByRole("button", { name: "Show description" }));
    expect(await screen.findByText("Loan fully repaid and account closed.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In this lifecycle" })).toBeInTheDocument();
    // The neighbour was asked for, and is still outstanding.
    expect(callsFor("st-sanctioned")).toBe(1);
    expect(screen.queryByTestId("step-preview")).toBeNull();
  });

  it("submitting the form (what Enter does) shows the description too", async () => {
    const { container } = renderWorkspace();
    await chooseAll();
    const form = container.querySelector("form");
    if (!form) throw new Error("no form");
    fireEvent.submit(form);
    expect(await screen.findByText("Loan fully repaid and account closed.")).toBeInTheDocument();
  });

  it("marks a shown description stale when the selection changes, and fetches nothing until asked again", async () => {
    renderWorkspace();
    await chooseAll();
    fireEvent.click(screen.getByRole("button", { name: "Show description" }));
    await screen.findByText("Loan fully repaid and account closed.");
    const before = mockFetchDescription.mock.calls.length;

    pick("Status", "sanction");
    expect(
      screen.getByText(/Selection changed: press Show description to update/),
    ).toBeInTheDocument();
    // The previous result stays visible, labelled as the previous one; no new request.
    expect(screen.getByText("Loan fully repaid and account closed.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(mockFetchDescription.mock.calls.length).toBe(before); // changing the selection fetched nothing

    fireEvent.click(screen.getByRole("button", { name: "Show description" }));
    expect(await screen.findByRole("heading", { name: "Sanctioned" })).toBeInTheDocument();
    expect(screen.getByText("Sanctioned text.")).toBeInTheDocument();
    expect(mockFetchDescription).toHaveBeenCalledWith("bank-a", "lt-home", "st-sanctioned");
    expect(screen.queryByText(/Selection changed/)).not.toBeInTheDocument();
  });

  it("lists statuses by name in lifecycle order and resets loan type and status when the bank changes", async () => {
    renderWorkspace();
    await chooseAll();
    fireEvent.click(box("Status"));
    const listbox = screen.getByRole("listbox", { name: "Status" });
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Login", "Sanctioned"]);

    pick("Bank", "bank b");
    expect(box("Loan type")).toHaveValue("");
    expect(box("Status")).toHaveValue("");
    expect(box("Status")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show description" })).toBeDisabled();
  });

  // Regression: a bank with nothing attached rendered a silently empty
  // Loan type list, indistinguishable from a broken one.
  it("says plainly when the chosen bank has no loan types attached yet", async () => {
    mockFetchNav.mockResolvedValue({
      ...NAV,
      banks: [...NAV.banks, { id: "bank-new", name: "Brand New Bank", loanTypes: [] }],
    });
    renderWorkspace();
    await screen.findByRole("combobox", { name: "Bank" });
    pick("Bank", "brand new");

    expect(screen.getByText("This bank has no loan types attached yet.")).toBeInTheDocument();
    expect(box("Loan type")).toBeDisabled();
  });

  it("shows the NA state distinctly from a real description", async () => {
    mockFetchDescription.mockResolvedValue({ body: "NA" });
    renderWorkspace();
    await chooseAll();
    fireEvent.click(screen.getByRole("button", { name: "Show description" }));

    expect(
      await screen.findByText("No description has been added for this status yet."),
    ).toBeInTheDocument();
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
    renderWorkspace(new QueryClient({ defaultOptions: { queries: { retry: 3 } } }));
    expect(
      await screen.findByText(/couldn't load the bank and loan type list/i),
    ).toBeInTheDocument();
    expect(mockFetchNav).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockFetchNav).toHaveBeenCalledTimes(1);
    });
  });

  describe("summary, URL-held selection and recent lookups", () => {
    // URL and stored ids are validated as UUIDs, so these use real-shaped ids.
    const B = "0190a000-0000-7000-8000-00000000000b";
    const LT = "0190a000-0000-7000-8000-0000000000a1";
    const ST1 = "0190a000-0000-7000-8000-0000000000c1";
    const ST2 = "0190a000-0000-7000-8000-0000000000c2";
    const GONE = "0190a000-0000-7000-8000-0000000000ff";
    const UUID_NAV: WorkspaceNavResponse = {
      statuses: [
        { id: ST1, name: "Login", sortOrder: 1 },
        { id: ST2, name: "Sanctioned", sortOrder: 2 },
      ],
      loanTypes: [{ id: LT, name: "Home Loan" }],
      banks: [{ id: B, name: "HDFC Bank", loanTypes: [0] }],
    };
    const link = (bank: string, loanType: string, status: string) =>
      `/user/workspace?bank=${bank}&loanType=${loanType}&status=${status}`;
    const storageKey = `wtc.recent.v1.${USER_ID}`;

    beforeEach(() => {
      mockFetchNav.mockResolvedValue(UUID_NAV);
    });

    it("says what's in the system before anything is typed", async () => {
      mockFetchNav.mockResolvedValue(NAV);
      renderWorkspace();
      expect(await screen.findByText("2 banks · 2 loan types · 2 statuses")).toBeInTheDocument();
    });

    it("opening a link to a combination shows its description exactly once, with the fields filled", async () => {
      renderWorkspace(undefined, link(B, LT, ST2));
      expect(await screen.findByText("Loan fully repaid and account closed.")).toBeInTheDocument();
      expect(callsFor(ST2)).toBe(1);
      expect(box("Bank")).toHaveValue("HDFC Bank");
      // The field names the status; the position is the result's to show.
      expect(box("Status")).toHaveValue("Sanctioned");
      expect(screen.getByText("Step 2 of 2 in the loan lifecycle")).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 50));
      expect(callsFor(ST2)).toBe(1);
    });

    it("editing after opening a link marks the result stale and fetches nothing", async () => {
      renderWorkspace(undefined, link(B, LT, ST2));
      await screen.findByText("Loan fully repaid and account closed.");
      const before = mockFetchDescription.mock.calls.length;
      pick("Status", "login");
      expect(screen.getByText(/Selection changed/)).toBeInTheDocument();
      expect(mockFetchDescription.mock.calls.length).toBe(before);
    });

    it.each([
      ["malformed ids", link("not-a-uuid", LT, ST1)],
      ["a withdrawn status", link(B, LT, GONE)],
      ["only some of the three", `/user/workspace?bank=${B}`],
    ])("says a link is no longer available for %s, and fetches nothing", async (_, path) => {
      renderWorkspace(undefined, path);
      expect(
        await screen.findByText("That combination is no longer available. Choose again above."),
      ).toBeInTheDocument();
      expect(box("Bank")).toHaveValue("");
      expect(mockFetchDescription).not.toHaveBeenCalled();
    });

    it("remembers a successful lookup (ids and time only), and lists it before anything is typed", async () => {
      const first = renderWorkspace();
      await screen.findByRole("combobox", { name: "Bank" });
      expect(screen.queryByRole("heading", { name: "Recent lookups" })).not.toBeInTheDocument();
      pick("Bank", "hdfc");
      pick("Loan type", "home");
      pick("Status", "login");
      fireEvent.click(screen.getByRole("button", { name: "Show description" }));
      await screen.findByText("Login stage text.");

      await waitFor(() => {
        expect(window.localStorage.getItem(storageKey)).not.toBeNull();
      });
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown[];
      expect(stored).toHaveLength(1);
      expect(Object.keys(stored[0] as object).sort()).toEqual([
        "at",
        "bankId",
        "loanTypeId",
        "statusId",
      ]);
      first.unmount();

      renderWorkspace();
      const recent = await screen.findByRole("heading", { name: "Recent lookups" });
      const row = within(sectionOf(recent)).getByRole("link");
      expect(row).toHaveAttribute("href", link(B, LT, ST1));
      expect(row).toHaveTextContent("HDFC Bank · Home Loan");
      expect(row).toHaveTextContent("Login");
    });

    it("clicking a recent lookup shows it", async () => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify([
          { bankId: B, loanTypeId: LT, statusId: ST1, at: new Date().toISOString() },
        ]),
      );
      renderWorkspace();
      const recent = await screen.findByRole("heading", { name: "Recent lookups" });
      fireEvent.click(within(sectionOf(recent)).getByRole("link"));
      expect(await screen.findByText("Login stage text.")).toBeInTheDocument();
      expect(mockFetchDescription).toHaveBeenCalledWith(B, LT, ST1);
    });

    it("does not remember a lookup that failed", async () => {
      mockFetchDescription.mockRejectedValue(new ApiError("NOT_FOUND", "Not available.", 404));
      renderWorkspace(undefined, link(B, LT, ST1));
      expect(await screen.findByText("Not available.")).toBeInTheDocument();
      expect(window.localStorage.getItem(storageKey)).toBeNull();
    });
  });
});
