import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { RaiseQueryModal, type RaiseQueryContext } from "./RaiseQueryModal";

vi.mock("../../lib/userApi", async () => {
  const actual = await vi.importActual<typeof import("../../lib/userApi")>("../../lib/userApi");
  return { ...actual, raiseQuery: vi.fn() };
});

import { raiseQuery } from "../../lib/userApi";

const mockRaiseQuery = vi.mocked(raiseQuery);

const CONTEXT: RaiseQueryContext = {
  bankId: "bank-a",
  bankName: "Bank A",
  loanTypeId: "lt-a1",
  loanTypeName: "Home Loan",
  statusId: "st-a1-1",
  statusName: "Sanctioned",
};

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RaiseQueryModal isOpen onClose={onClose} context={CONTEXT} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

describe("RaiseQueryModal", () => {
  afterEach(() => {
    mockRaiseQuery.mockReset();
  });

  it("sends the correct bank/loan type/status triple with the trimmed message", async () => {
    mockRaiseQuery.mockResolvedValue({
      id: "q1",
      bankId: CONTEXT.bankId,
      loanTypeId: CONTEXT.loanTypeId,
      statusId: CONTEXT.statusId,
      bankNameSnapshot: CONTEXT.bankName,
      loanTypeNameSnapshot: CONTEXT.loanTypeName,
      statusNameSnapshot: CONTEXT.statusName,
      message: "Please clarify disbursement timing.",
      status: "pending",
      raisedAt: new Date().toISOString(),
      resolvedAt: null,
    });
    const { onClose } = renderModal();

    fireEvent.change(screen.getByLabelText("What would you like to ask?"), {
      target: { value: "  Please clarify disbursement timing.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Raise query" }));

    expect(await screen.findByText("Query raised.")).toBeInTheDocument();
    expect(mockRaiseQuery).toHaveBeenCalledWith({
      bankId: "bank-a",
      loanTypeId: "lt-a1",
      statusId: "st-a1-1",
      message: "Please clarify disbursement timing.",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a human-readable retry time on a 429", async () => {
    mockRaiseQuery.mockRejectedValue(
      new ApiError("TOO_MANY_REQUESTS", "Too many queries raised. Try again later.", 429, 754),
    );
    renderModal();

    fireEvent.change(screen.getByLabelText("What would you like to ask?"), {
      target: { value: "Another query." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Raise query" }));

    expect(
      await screen.findByText("Too many queries raised. Try again in about 13 minutes."),
    ).toBeInTheDocument();
  });
});
