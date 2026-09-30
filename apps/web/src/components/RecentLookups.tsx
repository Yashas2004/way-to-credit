import { useId } from "react";
import { Link } from "react-router-dom";
import { formatRelativeTime } from "../lib/format";
import { workspaceHref, type ResolvedLookup } from "../lib/recentLookups";

export interface RecentLookupsProps {
  items: ResolvedLookup[];
  /** How many to show. */
  limit?: number;
  className?: string;
}

/**
 * Hairline rows, one per recent lookup: "Bank · Loan type" as the eyebrow,
 * the status name as the title, when on the right. Each row is a link that
 * opens the Workspace with that combination shown. Renders nothing when
 * there's no history: no empty state for something optional.
 */
export function RecentLookups({ items, limit = 5, className = "" }: RecentLookupsProps) {
  const headingId = useId();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="mb-2 text-h3 font-medium text-muted">
        Recent lookups
      </h2>
      <ul className="divide-y divide-muted/10 overflow-hidden rounded-md bg-white shadow-card">
        {items.slice(0, limit).map((item) => (
          <li key={`${item.bankId}/${item.loanTypeId}/${item.statusId}`}>
            <Link
              to={workspaceHref(item)}
              className="flex items-baseline justify-between gap-4 px-4 py-2.5 hover:bg-ink/5"
            >
              <span className="min-w-0">
                <span className="block truncate text-small text-muted">
                  {item.bankName} · {item.loanTypeName}
                </span>
                <span className="block text-body font-medium text-ink">{item.statusName}</span>
              </span>
              <span className="shrink-0 text-small text-muted">{formatRelativeTime(item.at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
