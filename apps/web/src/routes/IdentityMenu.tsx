import type { AuthIdentity } from "@way-to-credit/shared";
import { useEffect, useRef, useState } from "react";
import { apiPost } from "../lib/api";

export interface IdentityMenuProps {
  identity: AuthIdentity;
  /** Tone flips depending on which shell hosts it — light text on the admin's maroon top bar, dark text on the user shell's paper one. */
  tone?: "light" | "dark";
}

export function IdentityMenu({ identity, tone = "dark" }: IdentityMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    try {
      await apiPost("/api/auth/logout");
    } finally {
      // Hard navigation, deliberately — resets React Query's cache and the
      // auth context in one step rather than plumbing a manual reset path
      // through both for what's an infrequent, non-hot-path action.
      window.location.href = "/login";
    }
  }

  const buttonTone = tone === "light" ? "text-paper hover:bg-paper/10" : "text-ink hover:bg-ink/5";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-sm px-2 py-1 text-body ${buttonTone}`}
      >
        <span className="hidden sm:inline">{identity.displayName}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brass text-small font-medium text-white">
          {identity.displayName.charAt(0).toUpperCase()}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-slate/20 bg-white py-1 shadow-elevated"
        >
          <div className="border-b border-slate/10 px-3 py-2 text-small text-slate sm:hidden">
            {identity.displayName}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            className="block w-full px-3 py-2 text-left text-body text-ink hover:bg-ink/5"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
