import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

/**
 * A form whose close handler is a fresh function every render — exactly how
 * every real modal in the app is written. That's the case that used to
 * re-run the focus trap on each keystroke and yank focus to the first field.
 */
function TwoFieldForm({ onClose }: { onClose: () => void }) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  function handleClose() {
    onClose();
  }
  return (
    <Modal isOpen onClose={handleClose} title="Form">
      <label>
        First
        <input
          value={first}
          onChange={(e) => {
            setFirst(e.target.value);
          }}
        />
      </label>
      <label>
        Second
        <input
          value={second}
          onChange={(e) => {
            setSecond(e.target.value);
          }}
        />
      </label>
    </Modal>
  );
}

describe("Modal", () => {
  it("focuses the first field on open, not the close button", () => {
    render(<TwoFieldForm onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText("First"));
  });

  it("keeps focus in a later field while typing several characters", () => {
    render(<TwoFieldForm onClose={vi.fn()} />);
    const second = screen.getByLabelText<HTMLInputElement>("Second");
    second.focus();

    for (const value of ["J", "Ja", "Jan", "Jane"]) {
      fireEvent.change(second, { target: { value } });
      expect(document.activeElement).toBe(second);
    }
    expect(second.value).toBe("Jane");
  });

  it("with two dialogs open, Escape closes only the one that has focus", () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <>
        <Modal isOpen onClose={closeOuter} title="Outer">
          <button type="button">Outer action</button>
        </Modal>
        <Modal isOpen onClose={closeInner} title="Inner">
          <button type="button">Inner action</button>
        </Modal>
      </>,
    );

    const inner = screen.getByRole("button", { name: "Inner action" });
    inner.focus();
    fireEvent.keyDown(inner, { key: "Escape" });

    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });
});
