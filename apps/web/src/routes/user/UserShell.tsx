import { Link, NavLink, Outlet } from "react-router-dom";
import { IstClock } from "../../components/IstClock";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../lib/auth";
import { useDensity } from "../../lib/useDensity";
import { IdentityMenu } from "../IdentityMenu";

const NAV_ITEMS = [
  { to: "/user/workspace", label: "Workspace", end: false },
  { to: "/user/queries", label: "My queries", end: false },
  { to: "/user/rewards", label: "My rewards", end: false },
];

/**
 * Top nav, not a sidebar — a user has three destinations, not nine, and a
 * lighter nav structure signals a lighter task before any content loads.
 * Stays visible at every width; three links never need a hamburger.
 */
export function UserShell() {
  const { identity } = useAuth();
  useDensity("comfortable");

  return (
    <div className="min-h-screen bg-canvas">
      {/*
        Below `sm`, three nav links plus the wordmark, clock, and identity
        menu no longer fit one row — this stacks into two: identity row,
        then a full-width nav row. At `sm` and up it collapses back into
        the single row the design plan specifies.
      */}
      <header className="flex flex-col border-b border-muted/20 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex h-14 items-center justify-between px-4 sm:h-auto sm:gap-6 sm:px-0">
          {/* Mobile: the mark alone (28px); the wordmark stays in the
              accessibility tree via sr-only so the link keeps its name. */}
          <Link to="/user" className="flex items-center gap-2.5 font-serif text-h2 text-ink">
            <Logo size={32} className="hidden sm:block" />
            <Logo size={28} className="sm:hidden" />
            <span className="sr-only sm:not-sr-only">Way To Credit</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-sm px-2.5 py-1.5 text-body ${
                    isActive ? "font-medium text-brand-ink" : "text-muted hover:text-ink"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 sm:hidden">
            <IstClock variant="user" compact />
            {identity && <IdentityMenu identity={identity} tone="dark" />}
          </div>
        </div>

        <nav className="flex items-center justify-between gap-1 border-t border-muted/10 px-2 py-1.5 sm:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex-1 rounded-sm px-2 py-1.5 text-center text-small ${
                  isActive ? "font-medium text-brand-ink" : "text-muted hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          <IstClock variant="user" />
          {identity && <IdentityMenu identity={identity} tone="dark" />}
        </div>
      </header>

      <main className="flex justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-3xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
