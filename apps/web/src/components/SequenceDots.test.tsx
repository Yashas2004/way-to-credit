import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SequenceDots } from "./SequenceDots";

const dots = () => screen.queryByTestId("sequence-dots");

describe("SequenceDots", () => {
  it("fills the first `value` of `total` dots, and always shows the label", () => {
    render(<SequenceDots value={3} total={5} label="3 of 5 points" />);
    const row = dots();
    expect(row).toHaveAttribute("aria-hidden", "true");
    const all = row?.children ?? [];
    expect(all).toHaveLength(5);
    expect([...all].filter((d) => d.className.includes("bg-brand-ink"))).toHaveLength(3);
    expect(screen.getByText("3 of 5 points")).toBeVisible();
  });

  it("drops the dots above the cap and keeps the text: 50 statuses is not a row of 50 dots", () => {
    render(<SequenceDots value={32} total={50} label="Step 32 of 50" />);
    expect(dots()).toBeNull();
    expect(screen.getByText("Step 32 of 50")).toBeInTheDocument();
  });

  it("clamps out-of-range values rather than drawing extra dots", () => {
    render(<SequenceDots value={9} total={4} label="All done" />);
    expect(dots()?.children).toHaveLength(4);
  });
});
