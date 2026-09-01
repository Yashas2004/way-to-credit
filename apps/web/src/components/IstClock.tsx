import { useEffect, useState } from "react";
import { formatIstClock, isWarningWindow } from "../lib/ist";

export interface IstClockProps {
  variant: "admin" | "user";
  /** Drops seconds and the "IST" suffix for tight top-bar space at narrow viewports. */
  compact?: boolean;
}

/**
 * Live-updating, fixed UTC+05:30 — never reads the browser's timezone.
 * Admins get the same clock, minus the warning state, regardless of the
 * actual time (§7.3: admin access is unrestricted). The warning state is
 * never color-only: a distinct icon and a text label both change too.
 */
export function IstClock({ variant, compact = false }: IstClockProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  const warning = variant === "user" && isWarningWindow(now);
  const display = formatIstClock(now, { seconds: !compact, suffix: !compact });
  const fullDisplay = formatIstClock(now);

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-body font-medium tabular-nums ${
        warning ? "bg-alert/10 text-alert" : "text-ink"
      }`}
      title={fullDisplay}
    >
      {warning && (
        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
          <path d="M6 1 11 10H1L6 1Z" fill="currentColor" />
          <rect x="5.4" y="4.2" width="1.2" height="3" rx="0.6" fill="white" />
          <rect x="5.4" y="7.6" width="1.2" height="1.2" rx="0.6" fill="white" />
        </svg>
      )}
      <span>{display}</span>
      {warning && !compact && <span className="text-small">Closing soon</span>}
    </div>
  );
}
