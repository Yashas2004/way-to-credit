import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IstClock } from "./IstClock";

describe("IstClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the current IST time regardless of the system's own timezone", () => {
    vi.setSystemTime(new Date(Date.UTC(2024, 0, 8, 6, 30, 0))); // 12:00:00 PM IST
    render(<IstClock variant="admin" />);
    expect(screen.getByText("12:00:00 PM IST")).toBeInTheDocument();
  });

  it("does not warn a user just before 17:30 IST", () => {
    vi.setSystemTime(new Date(Date.UTC(2024, 0, 8, 11, 59, 0))); // 17:29 IST
    render(<IstClock variant="user" />);
    expect(screen.queryByText("Closing soon")).not.toBeInTheDocument();
  });

  it("warns a user starting exactly at 17:30 IST", () => {
    vi.setSystemTime(new Date(Date.UTC(2024, 0, 8, 12, 0, 0))); // 17:30 IST
    render(<IstClock variant="user" />);
    expect(screen.getByText("Closing soon")).toBeInTheDocument();
  });

  it("never shows the warning state for an admin, even at the same instant", () => {
    vi.setSystemTime(new Date(Date.UTC(2024, 0, 8, 12, 0, 0))); // 17:30 IST
    render(<IstClock variant="admin" />);
    expect(screen.queryByText("Closing soon")).not.toBeInTheDocument();
  });
});
