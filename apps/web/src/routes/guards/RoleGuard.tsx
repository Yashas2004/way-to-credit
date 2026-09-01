import type { Role } from "@way-to-credit/shared";
import { Navigate, Outlet } from "react-router-dom";
import { Spinner } from "../../components/Spinner";
import { useAuth } from "../../lib/auth";

/**
 * Always redirects rather than rendering nothing, per the requirement:
 * loading -> a visible spinner (not a redirect yet — avoids a flash-redirect
 * to /login before GET /api/auth/me has even resolved); unauthenticated ->
 * /outside-window if that's specifically why, else /login; wrong role ->
 * /403; correct role -> renders the guarded subtree.
 */
function RoleGuard({ role }: { role: Role }) {
  const { status, identity, outsideAccessWindow } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return outsideAccessWindow ? (
      <Navigate to="/outside-window" replace />
    ) : (
      <Navigate to="/login" replace />
    );
  }

  if (identity?.role !== role) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}

export function AdminGuard() {
  return <RoleGuard role="admin" />;
}

export function UserGuard() {
  return <RoleGuard role="user" />;
}
