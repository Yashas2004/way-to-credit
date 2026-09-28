import type { IssueEntry } from "@way-to-credit/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IssueThread } from "./IssueThread";

const at = "2026-10-01T06:30:00.000Z";
function entry(overrides: Partial<IssueEntry>): IssueEntry {
  return {
    id: crypto.randomUUID(),
    kind: "message",
    authorType: "user",
    authorName: "Priya Sharma",
    body: "Hello",
    sentAt: at,
    ...overrides,
  };
}

describe("IssueThread", () => {
  it("renders message bodies as literal text, never as HTML", () => {
    const hostile = '<img src=x onerror="alert(1)"> <script>alert(2)</script> <b>bold?</b>';
    const { container } = render(
      <IssueThread
        entries={[entry({ body: hostile })]}
        status="awaiting_admin"
        viewer="admin"
        onReply={vi.fn()}
      />,
    );
    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("shows status changes as system lines, and 'You' for the user's own messages", () => {
    render(
      <IssueThread
        entries={[
          entry({ body: "It's broken" }),
          entry({ kind: "resolved", authorType: "admin", authorName: "Admin One", body: "" }),
        ]}
        status="resolved"
        viewer="user"
        onReply={vi.fn()}
      />,
    );
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText(/Resolved by Admin One/)).toBeInTheDocument();
  });

  it("warns that replying to a resolved request reopens it — and only then", () => {
    const { rerender } = render(
      <IssueThread entries={[entry({})]} status="resolved" viewer="user" onReply={vi.fn()} />,
    );
    expect(
      screen.getByText("This request is resolved. Replying will reopen it."),
    ).toBeInTheDocument();
    rerender(
      <IssueThread entries={[entry({})]} status="awaiting_user" viewer="user" onReply={vi.fn()} />,
    );
    expect(screen.queryByText(/Replying will reopen it/)).not.toBeInTheDocument();
  });

  it("sends the draft, clears it on success, and keeps it with an error on failure", async () => {
    const onReply = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Too many messages sent."));
    render(
      <IssueThread entries={[entry({})]} status="awaiting_user" viewer="user" onReply={onReply} />,
    );
    const box = screen.getByLabelText<HTMLTextAreaElement>("Your reply");

    fireEvent.change(box, { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() => {
      expect(box.value).toBe("");
    });
    expect(onReply).toHaveBeenCalledWith("First");

    fireEvent.change(box, { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many messages sent.");
    expect(box.value).toBe("Second");
  });
});
