import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "./components/Spinner";
import { ToastProvider } from "./components/Toast";
import { AuthProvider, useAuth } from "./lib/auth";
import { queryClient } from "./lib/queryClient";
import { AdminShell } from "./routes/admin/AdminShell";
import { ForbiddenPage } from "./routes/ForbiddenPage";
import { AdminGuard, UserGuard } from "./routes/guards/RoleGuard";
import { LoginPage } from "./routes/LoginPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { OutsideWindowPage } from "./routes/OutsideWindowPage";
import { PlaceholderPage } from "./routes/PlaceholderPage";
import { UserShell } from "./routes/user/UserShell";

/** Sends an already-authenticated visitor straight to their shell instead of bouncing through the login form. */
function RootRedirect() {
  const { status, identity } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Spinner size="lg" />
      </div>
    );
  }
  if (status === "authenticated") {
    return <Navigate to={identity?.role === "admin" ? "/admin" : "/user"} replace />;
  }
  return <Navigate to="/login" replace />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/403" element={<ForbiddenPage />} />
              <Route path="/outside-window" element={<OutsideWindowPage />} />

              <Route element={<AdminGuard />}>
                <Route path="/admin" element={<AdminShell />}>
                  <Route index element={<PlaceholderPage title="Dashboard" />} />
                  <Route
                    path="knowledge-base"
                    element={<PlaceholderPage title="Knowledge Base" />}
                  />
                  <Route path="users" element={<PlaceholderPage title="Users" />} />
                  <Route path="queries" element={<PlaceholderPage title="Queries" />} />
                  <Route path="milestones" element={<PlaceholderPage title="Milestones" />} />
                  <Route path="activity" element={<PlaceholderPage title="Activity" />} />
                </Route>
              </Route>

              <Route element={<UserGuard />}>
                <Route path="/user" element={<UserShell />}>
                  <Route index element={<PlaceholderPage title="Workspace" />} />
                  <Route path="rewards" element={<PlaceholderPage title="My Rewards" />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
