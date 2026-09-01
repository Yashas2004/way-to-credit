import { useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet } from "react-router-dom";
import { IstClock } from "../../components/IstClock";
import { useAuth } from "../../lib/auth";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { IdentityMenu } from "../IdentityMenu";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/knowledge-base", label: "Knowledge Base", end: false },
  { to: "/admin/users", label: "Users", end: false },
  { to: "/admin/queries", label: "Queries", end: false },
  { to: "/admin/milestones", label: "Milestones", end: false },
  { to: "/admin/activity", label: "Activity", end: false },
];

/**
 * Two responsive states, not three: a persistent 232px sidebar at >=1024px
 * (lg), and an off-canvas drawer below it (tablet and mobile alike). An
 * admin lives here for hours, so the sidebar is never a hamburger-only
 * affair on desktop; a narrower viewport gets a real drawer, not a
 * squeezed-down sidebar.
 */
export function AdminShell() {
  const { identity } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-paper">
      <div className="flex min-h-screen">
        <aside className="hidden w-[232px] shrink-0 flex-col bg-maroon px-3 py-5 text-paper lg:flex">
          <div className="mb-6 px-2">
            <span className="font-serif text-h2">Way To Credit</span>
          </div>
          <SidebarNav />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-slate/20 bg-paper px-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(true);
                }}
                aria-label="Open navigation"
                className="rounded-sm p-1.5 text-ink hover:bg-ink/5 lg:hidden"
              >
                <MenuIcon />
              </button>
              <span className="font-serif text-h2 text-ink lg:hidden">Way To Credit</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline">
                <IstClock variant="admin" />
              </span>
              <span className="sm:hidden">
                <IstClock variant="admin" compact />
              </span>
              {identity && <IdentityMenu identity={identity} tone="dark" />}
            </div>
          </header>

          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>

      <MobileDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
        }}
      />
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-body ${
              isActive ? "bg-paper/10 font-medium" : "text-paper/80 hover:bg-paper/5"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {/* The exact filled/outline dot vocabulary the treasure map
                  uses for "visited vs. not yet" — same shapes, this scale. */}
              {isActive ? (
                <svg viewBox="0 0 8 8" className="h-2 w-2 shrink-0 text-brass" aria-hidden="true">
                  <circle cx="4" cy="4" r="4" fill="currentColor" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 8 8"
                  className="h-2 w-2 shrink-0 text-paper/40"
                  aria-hidden="true"
                >
                  <circle
                    cx="4"
                    cy="4"
                    r="3.2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                  />
                </svg>
              )}
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function MobileDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const drawerRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Escape handling is on the drawer itself (see useFocusTrap) — this is purely a pointer-dismiss backdrop. */}
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="relative z-10 flex h-full w-64 flex-col bg-maroon px-3 py-5 text-paper shadow-elevated"
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <span className="font-serif text-h2">Way To Credit</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-sm p-1.5 hover:bg-paper/10"
          >
            <CloseIcon />
          </button>
        </div>
        <SidebarNav onNavigate={onClose} />
      </div>
    </div>,
    document.body,
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M3 5h14M3 10h14M3 15h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M5 5l10 10M15 5 5 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
