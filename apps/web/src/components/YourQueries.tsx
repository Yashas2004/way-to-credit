import { useQuery } from "@tanstack/react-query";
import type { QueryRow, WorkspaceNavResponse } from "@way-to-credit/shared";
import { Link } from "react-router-dom";
import { formatRelativeTime } from "../lib/format";
import { isAvailable, workspaceHref } from "../lib/recentLookups";
import { fetchOwnQueries } from "../lib/userApi";
import { LoadFailed, RailSection } from "./RailSection";

const RECENTLY_APPROVED_DAYS = 7;
const MAX_ROWS = 4;

/**
 * The user's own queries worth looking at again: the ones approved in the
 * last week (an approval usually means the description was updated, so "Look
 * up" opens the new text) and the ones still awaiting review. Hidden when
 * there are none. Reads the landing page's query cache (the newest 20), so
 * the two screens share one request; older queries live on My queries.
 */
export function YourQueries({
  nav,
  now = new Date(),
}: {
  /** The page's navigation data, for the Look up links (passed in: the page already loads it once). */
  nav: WorkspaceNavResponse | undefined;
  now?: Date;
}) {
  const queries = useQuery({
    queryKey: ["user", "queries", "landing"],
    queryFn: () => fetchOwnQueries({ limit: 20 }),
  });

  if (queries.isError) {
    return (
      <RailSection title="Your queries">
        <LoadFailed what="your queries" query={queries} />
      </RailSection>
    );
  }
  const cutoff = now.getTime() - RECENTLY_APPROVED_DAYS * 24 * 60 * 60 * 1000;
  const items = (queries.data?.items ?? [])
    .filter(
      (q) =>
        q.status === "pending" ||
        (q.status === "approved" && q.resolvedAt !== null && Date.parse(q.resolvedAt) >= cutoff),
    )
    // Recent approvals first: they're the ones whose description has likely
    // changed, so the ones most worth opening. Newest first within each.
    .sort((a, b) => Number(b.status === "approved") - Number(a.status === "approved"))
    .slice(0, MAX_ROWS);
  if (items.length === 0) return null;

  return (
    <RailSection
      title="Your queries"
      action={
        <Link to="/user/queries" className="text-small text-brand-ink underline">
          All queries
        </Link>
      }
    >
      <ul className="divide-y divide-muted/10 overflow-hidden rounded-md bg-white shadow-card">
        {items.map((q) => (
          <QueryItem key={q.id} q={q} now={now} canLookUp={Boolean(nav && isAvailable(nav, q))} />
        ))}
      </ul>
    </RailSection>
  );
}

function QueryItem({ q, now, canLookUp }: { q: QueryRow; now: Date; canLookUp: boolean }) {
  const outcome =
    q.status === "approved" && q.resolvedAt
      ? `Approved ${formatRelativeTime(q.resolvedAt, now)}`
      : `Awaiting review · raised ${formatRelativeTime(q.raisedAt, now)}`;
  return (
    <li className="px-4 py-2.5">
      <span className="block truncate text-small text-muted">
        {q.bankNameSnapshot} · {q.loanTypeNameSnapshot}
      </span>
      <span className="block text-body font-medium text-ink">{q.statusNameSnapshot}</span>
      <span className="flex items-baseline justify-between gap-3 text-small text-muted">
        <span>{outcome}</span>
        {canLookUp && (
          <Link
            to={workspaceHref(q)}
            className="shrink-0 text-brand-ink underline"
            aria-label={`Look up ${q.statusNameSnapshot} at ${q.bankNameSnapshot}, ${q.loanTypeNameSnapshot}`}
          >
            Look up
          </Link>
        )}
      </span>
    </li>
  );
}
