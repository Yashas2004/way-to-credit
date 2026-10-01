import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LifecycleRail } from "./LifecycleRail";

vi.mock("../lib/userApi", () => ({ fetchDescription: vi.fn() }));
import { fetchDescription } from "../lib/userApi";

const B = "0190a000-0000-7000-8000-00000000000b";
const LT = "0190a000-0000-7000-8000-0000000000a1";
const steps = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `0190a000-0000-7000-8000-${String(i + 1).padStart(12, "0")}`,
    name: `Status ${String(i + 1)}`,
  }));

function renderRail(total: number, step: number, ready = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LifecycleRail
          steps={steps(total)}
          current={step - 1}
          bankId={B}
          loanTypeId={LT}
          ready={ready}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const items = () => within(screen.getByRole("list")).getAllByRole("listitem");
const names = () => items().map((li) => li.querySelector(".text-body")?.textContent);

describe("LifecycleRail", () => {
  beforeEach(() => {
    vi.mocked(fetchDescription).mockReset();
    vi.mocked(fetchDescription).mockImplementation((_b, _lt, statusId) =>
      Promise.resolve({ body: `Text for ${statusId.slice(-2)}` }),
    );
  });

  it("shows two steps before and three after, marks the current one, and links the rest", () => {
    renderRail(50, 8);
    expect(names()).toEqual([
      "Status 6",
      "Status 7",
      "Status 8",
      "Status 9",
      "Status 10",
      "Status 11",
    ]);
    const current = items()[2];
    if (!current) throw new Error("no current step");
    expect(current).toHaveAttribute("aria-current", "step");
    expect(current).toHaveTextContent("Step 8 of 50 · viewing");
    expect(within(current).queryByRole("link")).toBeNull();
    expect(screen.getByRole("link", { name: /Status 9/ })).toHaveAttribute(
      "href",
      `/user/workspace?bank=${B}&loanType=${LT}&status=${steps(50)[8]?.id ?? ""}`,
    );
  });

  it("slides at the ends: the last step shows the last six", () => {
    renderRail(50, 50);
    expect(names()).toEqual([
      "Status 45",
      "Status 46",
      "Status 47",
      "Status 48",
      "Status 49",
      "Status 50",
    ]);
  });

  it("shows the whole lifecycle when it's shorter than the window, with no 'All steps' toggle", () => {
    renderRail(3, 2);
    expect(names()).toEqual(["Status 1", "Status 2", "Status 3"]);
    expect(screen.queryByRole("button", { name: /All .* steps/ })).not.toBeInTheDocument();
  });

  it("'All N steps' opens the full ordered list, and closes again", () => {
    renderRail(50, 8);
    fireEvent.click(screen.getByRole("button", { name: "All 50 steps" }));
    expect(items()).toHaveLength(50);
    expect(names()[0]).toBe("Status 1");
    fireEvent.click(screen.getByRole("button", { name: "Show nearby steps" }));
    expect(items()).toHaveLength(6);
  });

  it("previews only the previous and next steps", async () => {
    renderRail(50, 8);
    await waitFor(() => {
      expect(screen.getAllByTestId("step-preview")).toHaveLength(2);
    });
    const fetched = vi.mocked(fetchDescription).mock.calls.map((c) => c[2]);
    expect(fetched.sort()).toEqual([steps(50)[6]?.id, steps(50)[8]?.id].sort());
  });

  it("previews nothing at all until the main result is ready", async () => {
    renderRail(50, 8, false);
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchDescription).not.toHaveBeenCalled();
    expect(screen.queryByTestId("step-preview")).toBeNull();
  });

  it("at the first step there's no previous: only the next is previewed", async () => {
    renderRail(50, 1);
    await waitFor(() => {
      expect(screen.getAllByTestId("step-preview")).toHaveLength(1);
    });
    expect(vi.mocked(fetchDescription).mock.calls.map((c) => c[2])).toEqual([steps(50)[1]?.id]);
  });
});
