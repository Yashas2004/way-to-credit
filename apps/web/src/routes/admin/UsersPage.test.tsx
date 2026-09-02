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
    fireEvent.change(await screen.findByLabelText("Delta (positive to add, negative to deduct)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Bonus" } });
    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    await waitFor(() => {
      expect(mockAdjustUserCredits).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Adjust credits" }));
    fireEvent.change(await screen.findByLabelText("Delta (positive to add, negative to deduct)"), {
      target: { value: "3" },
    });
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
});
