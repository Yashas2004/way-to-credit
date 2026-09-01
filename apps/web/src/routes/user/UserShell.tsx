import { NavLink, Outlet } from "react-router-dom";
import { IstClock } from "../../components/IstClock";
import { useAuth } from "../../lib/auth";
import { IdentityMenu } from "../IdentityMenu";

const NAV_ITEMS = [
  { to: "/user", label: "Workspace", end: true },
  { to: "/user/rewards", label: "My Rewards", end: false },
];

/**
 * Top nav, not a sidebar — a user has two destinations, not nine, and a
 * lighter nav structure signals a lighter task before any content loads.
 * Stays visible at every width; two links never need a hamburger.
 */
export function UserShell() {
  const { identity } = useAuth();

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex h-14 items-center justify-between border-b border-slate/20 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="font-serif text-h2 text-ink">Way To Credit</span>
          <nav className="flex items-center gap-1">
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
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline">
            <IstClock variant="user" />
          </span>
          <span className="sm:hidden">
            <IstClock variant="user" compact />
          </span>
          {identity && <IdentityMenu identity={identity} tone="dark" />}
        </div>
      </header>

      <main className="flex justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
