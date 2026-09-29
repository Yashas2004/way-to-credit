import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { WorkspaceNavResponse } from "@way-to-credit/shared";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function renderWorkspace(client?: QueryClient) {
  const queryClient =
    client ??
    new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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

const box = (label: string) => screen.getByRole("combobox", { name: label });

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

describe("WorkspacePage", () => {
  beforeEach(() => {
    mockFetchNav.mockReset();
    mockFetchDescription.mockReset();
    mockFetchNav.mockResolvedValue(NAV);
    mockFetchDescription.mockResolvedValue({ body: "Loan fully repaid and account closed." });
  });

  it("loads nothing until asked: choosing all three fetches no description", async () => {
    renderWorkspace();
    await chooseAll();
    expect(box("Loan type")).toHaveValue("HDFC Home Loan");
    expect(box("Status")).toHaveValue("Login — step 1 of 2");
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
    expect(mockFetchDescription).toHaveBeenCalledTimes(1);
    expect(mockFetchDescription).toHaveBeenCalledWith("bank-a", "lt-home", "st-login");
    expect(screen.getByText("Bank A · HDFC Home Loan")).toBeInTheDocument();
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

    pick("Status", "sanction");
    expect(
      screen.getByText(/Selection changed: press Show description to update/),
    ).toBeInTheDocument();
    // The previous result stays visible, labelled as the previous one; no new request.
    expect(screen.getByText("Loan fully repaid and account closed.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(mockFetchDescription).toHaveBeenCalledTimes(1);

    mockFetchDescription.mockResolvedValue({ body: "Sanctioned text." });
    fireEvent.click(screen.getByRole("button", { name: "Show description" }));
    expect(await screen.findByText("Sanctioned text.")).toBeInTheDocument();
    expect(mockFetchDescription).toHaveBeenLastCalledWith("bank-a", "lt-home", "st-sanctioned");
    expect(screen.queryByText(/Selection changed/)).not.toBeInTheDocument();
  });

  it("lists statuses in lifecycle order and resets loan type and status when the bank changes", async () => {
    renderWorkspace();
    await chooseAll();
    fireEvent.click(box("Status"));
    const listbox = screen.getByRole("listbox", { name: "Status" });
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Login — step 1 of 2", "Sanctioned — step 2 of 2"]);

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
});
