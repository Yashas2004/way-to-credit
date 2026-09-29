import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminUserView } from "@way-to-credit/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { UsersPage } from "./UsersPage";

vi.mock("../../lib/adminApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/adminApi")>("../../lib/adminApi");
  return {
    ...actual,
    fetchUsers: vi.fn(),
    createUser: vi.fn(),
    resetUserPassword: vi.fn(),
    deactivateUser: vi.fn(),
    reactivateUser: vi.fn(),
    adjustUserCredits: vi.fn(),
  };
});

import { adjustUserCredits, deactivateUser, fetchUsers } from "../../lib/adminApi";

const mockFetchUsers = vi.mocked(fetchUsers);
const mockDeactivateUser = vi.mocked(deactivateUser);
const mockAdjustUserCredits = vi.mocked(adjustUserCredits);

const USER: AdminUserView = {
  id: "user-1",
  userId: "jdoe",
  displayName: "Jane Doe",
  creditPoints: 5,
  isActive: true,
  lastSeenAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <UsersPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("UsersPage", () => {
  afterEach(() => {
    mockFetchUsers.mockReset();
    mockDeactivateUser.mockReset();
    mockAdjustUserCredits.mockReset();
  });

  it("shows the immediate-logout warning before deactivating, and doesn't call the API until confirmed", async () => {
    mockFetchUsers.mockResolvedValue([USER]);
    renderPage();

    await screen.findByText("jdoe");
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(
      await screen.findByText(
        "This logs Jane Doe out immediately and blocks further sign-ins until reactivated.",
      ),
    ).toBeInTheDocument();
    expect(mockDeactivateUser).not.toHaveBeenCalled();
  });

  it("sends a fresh, distinct Idempotency-Key on two separate credit-adjustment submissions", async () => {
    mockFetchUsers.mockResolvedValue([USER]);
    mockAdjustUserCredits.mockResolvedValue({
      userId: USER.id,
      creditPoints: 5,
      newlyUnlockedMilestones: [],
    });

    renderPage();
    await screen.findByText("jdoe");

    fireEvent.click(screen.getByRole("button", { name: "Adjust credits" }));
    fireEvent.change(
      await screen.findByLabelText("Credits (positive to add, negative to deduct)"),
      {
        target: { value: "5" },
      },
    );
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Bonus" } });
    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    await waitFor(() => {
      expect(mockAdjustUserCredits).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Adjust credits" }));
    fireEvent.change(
      await screen.findByLabelText("Credits (positive to add, negative to deduct)"),
      {
        target: { value: "3" },
      },
    );
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Bonus 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    await waitFor(() => {
      expect(mockAdjustUserCredits).toHaveBeenCalledTimes(2);
    });

    const firstKey = mockAdjustUserCredits.mock.calls[0]?.[2];
    const secondKey = mockAdjustUserCredits.mock.calls[1]?.[2];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(firstKey).not.toBe(secondKey);
  });

  // Regression: typing in Display name used to jump focus to User ID on
  // every keystroke (the focus trap re-ran whenever the modal re-rendered).
  it("create user: keeps focus in Display name while typing several characters", async () => {
    mockFetchUsers.mockResolvedValue([USER]);
    renderPage();
    await screen.findByText("jdoe");

    fireEvent.click(screen.getByRole("button", { name: "Create user" }));
    const displayName = await screen.findByLabelText<HTMLInputElement>("Display name");
    displayName.focus();

    for (const value of ["J", "Ja", "Jan", "Jane"]) {
      fireEvent.change(displayName, { target: { value } });
      expect(document.activeElement).toBe(displayName);
    }
    expect(displayName.value).toBe("Jane");
    expect(screen.getByLabelText<HTMLInputElement>("User ID").value).toBe("");
  });

  // Regression: the "pre-filled defaults" were the browser autofilling the
  // admin's own saved login into an unannotated username/password pair.
  it("create user: starts empty and opts every field out of login autofill", async () => {
    mockFetchUsers.mockResolvedValue([USER]);
    renderPage();
    await screen.findByText("jdoe");

    fireEvent.click(screen.getByRole("button", { name: "Create user" }));
    const userId = await screen.findByLabelText<HTMLInputElement>("User ID");
    const displayName = screen.getByLabelText<HTMLInputElement>("Display name");
    const password = screen.getByLabelText<HTMLInputElement>("Temporary password");

    expect([userId.value, displayName.value, password.value]).toEqual(["", "", ""]);
    expect(userId).toHaveAttribute("autocomplete", "off");
    expect(displayName).toHaveAttribute("autocomplete", "off");
    expect(password).toHaveAttribute("autocomplete", "new-password");
  });

  it("adjust credits: keeps focus in Reason while typing, and only accepts whole numbers", async () => {
    mockFetchUsers.mockResolvedValue([USER]);
    renderPage();
    await screen.findByText("jdoe");

    fireEvent.click(screen.getByRole("button", { name: "Adjust credits" }));
    const credits = await screen.findByLabelText<HTMLInputElement>(
      "Credits (positive to add, negative to deduct)",
    );

    // Decimals, exponents, and junk (typed or pasted — both arrive as a
    // change) never enter the field.
    for (const invalid of ["1.5", "1e2", "abc", "5-"]) {
      fireEvent.change(credits, { target: { value: invalid } });
      expect(credits.value).toBe("");
    }
    fireEvent.change(credits, { target: { value: "-" } });
    fireEvent.change(credits, { target: { value: "-3" } });
    expect(credits.value).toBe("-3");

    const reason = screen.getByLabelText<HTMLTextAreaElement>("Reason");
    reason.focus();
    for (const value of ["B", "Bo", "Bon", "Bonus"]) {
      fireEvent.change(reason, { target: { value } });
      expect(document.activeElement).toBe(reason);
    }
  });
});
