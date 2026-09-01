import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, type Mock } from "vitest";
import { useAuth } from "../../lib/auth";
import { AdminGuard, UserGuard } from "./RoleGuard";

vi.mock("../../lib/auth", () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as Mock;

function renderWithGuard(guard: "admin" | "user", path: string) {
  const Guard = guard === "admin" ? AdminGuard : UserGuard;
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/403" element={<div>Forbidden Page</div>} />
        <Route path="/outside-window" element={<div>Outside Window Page</div>} />
        <Route element={<Guard />}>
          <Route path={path} element={<div>Protected Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoleGuard", () => {
  it("shows a spinner while loading, without redirecting anywhere", () => {
    mockUseAuth.mockReturnValue({ status: "loading", identity: null, outsideAccessWindow: false });
    renderWithGuard("admin", "/admin");
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor to /login", () => {
    mockUseAuth.mockReturnValue({
      status: "unauthenticated",
      identity: null,
      outsideAccessWindow: false,
    });
    renderWithGuard("admin", "/admin");
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("redirects to /outside-window when that was specifically why", () => {
    mockUseAuth.mockReturnValue({
      status: "unauthenticated",
      identity: null,
      outsideAccessWindow: true,
    });
    renderWithGuard("user", "/user");
    expect(screen.getByText("Outside Window Page")).toBeInTheDocument();
  });

  it("redirects an authenticated user with the wrong role to /403 (user on an admin route)", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      identity: { id: "1", role: "user", identifier: "u1", displayName: "U" },
      outsideAccessWindow: false,
    });
    renderWithGuard("admin", "/admin");
    expect(screen.getByText("Forbidden Page")).toBeInTheDocument();
  });

  it("redirects an authenticated admin with the wrong role to /403 (admin on a user route)", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      identity: { id: "1", role: "admin", identifier: "a1", displayName: "A" },
      outsideAccessWindow: false,
    });
    renderWithGuard("user", "/user");
    expect(screen.getByText("Forbidden Page")).toBeInTheDocument();
  });

  it("renders the protected content for the correct role", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      identity: { id: "1", role: "admin", identifier: "a1", displayName: "A" },
      outsideAccessWindow: false,
    });
    renderWithGuard("admin", "/admin");
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });
});
