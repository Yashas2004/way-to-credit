import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet } from "react-router-dom";
import { IstClock } from "../../components/IstClock";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../lib/auth";
import { useDensity } from "../../lib/useDensity";
import { fetchIssueUnreadCount } from "../../lib/userApi";
import { IdentityMenu } from "../IdentityMenu";

/** Max 1200px, centred; the side gutters match the old header's. */
const SHELL_CONTAINER = "mx-auto w-full max-w-[75rem] px-4 sm:px-6 lg:px-8";
/** The same box for the header; below `sm` its two rows carry their own padding. */
const HEADER_CONTAINER = "mx-auto w-full max-w-[75rem] sm:px-6 lg:px-8";

const NAV_ITEMS = [
  { to: "/user/workspace", label: "Workspace", end: false },
  { to: "/user/queries", label: "My queries", end: false },
  { to: "/user/rewards", label: "My rewards", end: false },
];

/**
 * Top nav, not a sidebar — a user has three destinations, not nine, and a
 * lighter nav structure signals a lighter task before any content loads.
 * Stays visible at every width; three links never need a hamburger.
 *
 * The header's contents and the page share one container, so the logo, the
 * nav and every page heading start on the same left edge. (They used to be
 * two grids: a full-bleed header with the logo at x=24 over a centred 768px
 * column, which at 1920px put the heading 552px to the right of the logo.)
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
      <header className="border-b border-muted/20">
        <div
          className={`${HEADER_CONTAINER} flex flex-col sm:h-14 sm:flex-row sm:items-center sm:justify-between`}
        >
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
              <HelpButton />
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
            <HelpButton />
            <IstClock variant="user" />
            {identity && <IdentityMenu identity={identity} tone="dark" />}
          </div>
        </div>
      </header>

      <main className={`${SHELL_CONTAINER} py-10`}>
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Pages that keep the original centred 768px reading column (the rewards
 * certificate, help requests): they were designed for it and aren't part of
 * the wide layout.
 */
export function NarrowColumn() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Outlet />
    </div>
  );
}

/**
 * Help requests live behind this header button on every user page, with an
 * unread badge on the same 30-second poll as everything else (it pauses in
 * a hidden tab). The count is also announced as text, not just shown.
 */
function HelpButton() {
  const unread = useQuery({
    queryKey: ["user", "issues", "unread-count"],
    queryFn: fetchIssueUnreadCount,
    refetchInterval: 30_000,
  });
  const count = unread.data?.count ?? 0;
  return (
    <NavLink
      to="/user/help"
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-small font-medium ${
          isActive ? "border-brand-ink text-brand-ink" : "border-muted/40 text-ink hover:bg-ink/5"
        }`
      }
    >
      Help
      {count > 0 && (
        <>
          <span
            aria-hidden="true"
            className="min-w-5 rounded-full bg-brand px-1.5 text-center text-small text-ink"
          >
            {count}
          </span>
          <span className="sr-only">
            , {count} unread repl{count === 1 ? "y" : "ies"}
          </span>
        </>
      )}
    </NavLink>
  );
}
