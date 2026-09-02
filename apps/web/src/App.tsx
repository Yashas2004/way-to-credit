import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "./components/Spinner";
import { ToastProvider } from "./components/Toast";
import { AuthProvider, useAuth } from "./lib/auth";
import { queryClient } from "./lib/queryClient";
import { ActivityPage } from "./routes/admin/ActivityPage";
import { AdminShell } from "./routes/admin/AdminShell";
import { DashboardPage } from "./routes/admin/DashboardPage";
import { KnowledgeBasePage } from "./routes/admin/KnowledgeBasePage";
import { MilestonesPage } from "./routes/admin/MilestonesPage";
import { QueriesPage } from "./routes/admin/QueriesPage";
import { UsersPage } from "./routes/admin/UsersPage";
import { ForbiddenPage } from "./routes/ForbiddenPage";
import { AdminGuard, UserGuard } from "./routes/guards/RoleGuard";
import { LoginPage } from "./routes/LoginPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { OutsideWindowPage } from "./routes/OutsideWindowPage";
import { LandingPage } from "./routes/user/LandingPage";
import { MyQueriesPage } from "./routes/user/MyQueriesPage";
import { RewardsPage } from "./routes/user/RewardsPage";
import { UserShell } from "./routes/user/UserShell";
import { WorkspacePage } from "./routes/user/WorkspacePage";

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
                  <Route index element={<DashboardPage />} />
                  <Route path="knowledge" element={<KnowledgeBasePage />} />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="queries" element={<QueriesPage />} />
                  <Route path="milestones" element={<MilestonesPage />} />
                  <Route path="activity" element={<ActivityPage />} />
                </Route>
              </Route>

              <Route element={<UserGuard />}>
                <Route path="/user" element={<UserShell />}>
                  <Route index element={<LandingPage />} />
                  <Route path="workspace" element={<WorkspacePage />} />
                  <Route path="queries" element={<MyQueriesPage />} />
                  <Route path="rewards" element={<RewardsPage />} />
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
