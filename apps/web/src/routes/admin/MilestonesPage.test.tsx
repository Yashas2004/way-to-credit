import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MilestoneResponse } from "@way-to-credit/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { MilestonesPage } from "./MilestonesPage";

vi.mock("../../lib/adminApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/adminApi")>("../../lib/adminApi");
  return {
    ...actual,
    fetchMilestones: vi.fn(),
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
    deactivateMilestone: vi.fn(),
    reactivateMilestone: vi.fn(),
  };
});

import { fetchMilestones } from "../../lib/adminApi";

const mockFetchMilestones = vi.mocked(fetchMilestones);

const MILESTONE: MilestoneResponse = {
  id: "m-2",
  levelNumber: 2,
  pointsRequired: 10,
  title: "Level 2",
  message: "₹500 gift voucher",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  unlockedCount: 3,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MilestonesPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function openDialog(name: string) {
  return screen.findByRole("dialog", { name });
}

describe("MilestonesPage", () => {
  afterEach(() => {
    mockFetchMilestones.mockReset();
  });

  // Regression: one always-mounted form seeded its fields once, so Edit
  // opened blank and Create-after-Edit showed the edited milestone.
  it("Edit opens pre-populated, and Create afterwards opens blank", async () => {
    mockFetchMilestones.mockResolvedValue([MILESTONE]);
    renderPage();
    await screen.findByText("Level 2");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const edit = await openDialog("Edit milestone");
    expect(within(edit).getByLabelText<HTMLInputElement>("Level number").value).toBe("2");
    expect(within(edit).getByLabelText<HTMLInputElement>("Points required").value).toBe("10");
    expect(within(edit).getByLabelText<HTMLInputElement>("Title").value).toBe("Level 2");

    fireEvent.click(within(edit).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Create milestone" }));

    const create = await openDialog("Create milestone");
    expect(within(create).getByLabelText<HTMLInputElement>("Level number").value).toBe("");
    expect(within(create).getByLabelText<HTMLInputElement>("Title").value).toBe("");
  });

  // Regression: in the edit modal the first field (Level) is disabled, so the
  // re-running focus trap dropped focus out of the dialog on every keystroke.
  it("Edit: keeps focus in Title while typing several characters", async () => {
    mockFetchMilestones.mockResolvedValue([MILESTONE]);
    renderPage();
    await screen.findByText("Level 2");

    // A real click focuses the button first — and that trigger is exactly
    // where the old focus trap kept throwing focus back to (fireEvent.click
    // alone doesn't focus, which let this bug hide from the test).
    const editButton = screen.getByRole("button", { name: "Edit" });
    editButton.focus();
    fireEvent.click(editButton);
    const edit = await openDialog("Edit milestone");
    const title = within(edit).getByLabelText<HTMLInputElement>("Title");
    title.focus();

    for (const value of ["Level 2!", "Level 2!!", "Level 2!!!"]) {
      fireEvent.change(title, { target: { value } });
      expect(document.activeElement).toBe(title);
    }
  });

  it("Points required rejects decimals and exponents", async () => {
    mockFetchMilestones.mockResolvedValue([MILESTONE]);
    renderPage();
    await screen.findByText("Level 2");

    fireEvent.click(screen.getByRole("button", { name: "Create milestone" }));
    const create = await openDialog("Create milestone");
    const points = within(create).getByLabelText<HTMLInputElement>("Points required");

    for (const invalid of ["2.5", "1e1", "-5"]) {
      fireEvent.change(points, { target: { value: invalid } });
      expect(points.value).toBe("");
    }
  });
});
