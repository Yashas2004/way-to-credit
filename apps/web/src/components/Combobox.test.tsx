import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { normalizeForMatch } from "../lib/normalizeForMatch";
import { Combobox, type ComboboxOption } from "./Combobox";

const OPTIONS: ComboboxOption[] = [
  { value: "hdfc-home", label: "HDFC Home Loan" },
  { value: "car", label: "Car Loan" },
  { value: "personal", label: "Personal Loan" },
];

function Harness({
  options = OPTIONS,
  onChange = vi.fn(),
  initial = "",
}: {
  options?: ComboboxOption[];
  onChange?: (v: string) => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Combobox
      label="Loan type"
      options={options}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

const input = () => screen.getByRole("combobox", { name: "Loan type" });
const visibleOptions = () =>
  within(screen.getByRole("listbox", { hidden: true })).queryAllByRole("option", { hidden: true });

describe("Combobox", () => {
  it("is a real combobox: labelled input, listbox, options", () => {
    render(<Harness />);
    const box = input();
    expect(box).toHaveAttribute("aria-autocomplete", "list");
    expect(box).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Loan type" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("matches substrings, not just prefixes: 'home' finds 'HDFC Home Loan'", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "home" } });
    expect(visibleOptions().map((o) => o.textContent)).toEqual(["HDFC Home Loan"]);
  });

  it("ignores case and extra whitespace", () => {
    expect(normalizeForMatch("  HDFC   Home\tLoan ")).toBe("hdfc home loan");
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "  hdfc   HOME " } });
    expect(visibleOptions().map((o) => o.textContent)).toEqual(["HDFC Home Loan"]);
  });

  it("is keyboard-operable: Down/Up move, Enter picks, and the active option is announced", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const box = input();
    fireEvent.keyDown(box, { key: "ArrowDown" }); // opens, first active
    expect(box.getAttribute("aria-activedescendant")).toBe(visibleOptions()[0]?.id);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(box.getAttribute("aria-activedescendant")).toBe(visibleOptions()[1]?.id);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("car");
    expect(box).toHaveValue("Car Loan");
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape closes the list, then clears the choice", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial="car" />);
    const box = input();
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(box).toHaveValue("Car Loan");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(box).toHaveValue("");
  });

  // jsdom doesn't perform a browser's implicit form submission on Enter, so
  // this asserts the precondition for it: whether the combobox swallows the
  // key. Closed, it must not (Enter submits the form). Open with a highlighted
  // option, it must (Enter picks the option, and must not also submit).
  it("leaves Enter to the form when the list is closed, and takes it when picking an option", () => {
    render(<Harness initial="car" />);
    const box = input();
    const enter = () => {
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      act(() => {
        box.dispatchEvent(event);
      });
      return event.defaultPrevented;
    };
    expect(enter()).toBe(false);

    fireEvent.keyDown(box, { key: "ArrowDown" }); // open, first option active
    expect(enter()).toBe(true);
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("caps rendered matches at 50 with a count, and narrows as you type", () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({
      value: `b${String(i)}`,
      label: `Bank ${String(i).padStart(4, "0")}`,
    }));
    render(<Harness options={many} />);
    fireEvent.click(input());
    expect(visibleOptions()).toHaveLength(50);
    expect(screen.getByText("Showing 50 of 1000: keep typing to narrow.")).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: "0500" } });
    expect(visibleOptions().map((o) => o.textContent)).toEqual(["Bank 0500"]);
  });

  it("says when nothing matches", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "mortgage" } });
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("renders labels as text only, highlighting the match", () => {
    const { container } = render(
      <Harness options={[{ value: "x", label: "<b>Home</b> <img src=x>" }]} />,
    );
    fireEvent.change(input(), { target: { value: "home" } });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("li b")).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe("Home");
  });
});
