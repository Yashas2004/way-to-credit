import { Link, NavLink, Outlet } from "react-router-dom";
import { IstClock } from "../../components/IstClock";
import { useAuth } from "../../lib/auth";
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

  return (
    <div className="min-h-screen bg-paper">
      {/*
        Below `sm`, three nav links plus the wordmark, clock, and identity
        menu no longer fit one row — this stacks into two: identity row,
        then a full-width nav row. At `sm` and up it collapses back into
        the single row the design plan specifies.
      */}
      <header className="flex flex-col border-b border-slate/20 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex h-14 items-center justify-between px-4 sm:h-auto sm:gap-6 sm:px-0">
          <Link to="/user" className="font-serif text-h3 text-ink sm:text-h2">
            Way To Credit
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-sm px-2.5 py-1.5 text-body ${
                    isActive ? "font-medium text-maroon" : "text-slate hover:text-ink"
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

        <nav className="flex items-center justify-between gap-1 border-t border-slate/10 px-2 py-1.5 sm:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex-1 rounded-sm px-2 py-1.5 text-center text-small ${
                  isActive ? "font-medium text-maroon" : "text-slate hover:text-ink"
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
