import type { AuthIdentity } from "@way-to-credit/shared";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet, registerAuthFailureHandler, registerOutsideAccessWindowHandler } from "./api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  identity: AuthIdentity | null;
  /** Set when the *reason* for being unauthenticated was an OUTSIDE_ACCESS_WINDOW response — guards use this to route to /outside-window instead of /login. */
  outsideAccessWindow: boolean;
  /** Returns the freshly-fetched identity (or null) directly — callers like LoginPage need it immediately, before React has re-rendered with the new context value. */
  refetch: () => Promise<AuthIdentity | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * State is exactly "did GET /api/auth/me succeed" — nothing else. The
 * frontend cannot read httpOnly cookies and never tries to; there is no
 * token anywhere in this component, ever.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [outsideAccessWindow, setOutsideAccessWindow] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await apiGet<AuthIdentity>("/api/auth/me");
      setIdentity(me);
      setOutsideAccessWindow(false);
      setStatus("authenticated");
      return me;
    } catch {
      setIdentity(null);
      setStatus("unauthenticated");
      return null;
    }
  }, []);

  useEffect(() => {
    // Registered once — api.ts has no React state of its own, so these
    // callbacks are how a 401-after-failed-refresh or an
    // OUTSIDE_ACCESS_WINDOW response (from *any* request, not just /me)
    // reach this context and clear it. The route guards react to the
    // resulting state change; no navigation happens here.
    registerAuthFailureHandler(() => {
      setIdentity(null);
      setOutsideAccessWindow(false);
      setStatus("unauthenticated");
    });
    registerOutsideAccessWindowHandler(() => {
      setIdentity(null);
      setOutsideAccessWindow(true);
      setStatus("unauthenticated");
    });
    void load();
  }, [load]);

  return (
    <AuthContext.Provider value={{ status, identity, outsideAccessWindow, refetch: load }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
