import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HealthCheck } from "./HealthCheck";

describe("HealthCheck", () => {
  it("renders the app heading", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <HealthCheck />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Way To Credit" })).toBeInTheDocument();
  });
});
