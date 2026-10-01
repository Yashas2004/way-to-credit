import { useQuery } from "@tanstack/react-query";
import type { IssueSummary, QueryRow } from "@way-to-credit/shared";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { CreditProgress } from "../../components/CreditProgress";
import { LoadFailed, RailSection, type LoadState } from "../../components/RailSection";
import { RecentLookups } from "../../components/RecentLookups";
import { useAuth } from "../../lib/auth";
import { formatRelativeTime } from "../../lib/format";
import { resolveRecentLookups, useRecentLookups } from "../../lib/recentLookups";
import {
  fetchIssueUnreadCount,
  fetchOwnIssues,
  fetchOwnQueries,
  fetchWorkspaceNav,
} from "../../lib/userApi";

/** Rows shown in each rail list; the full lists are a link away. */
const LIST_LIMIT = 3;
/** The newest queries fetched to find pending ones (the list has no status filter). */
const LATEST_QUERIES = 20;

/**
 * What's for me today. The task comes first (a new lookup, or one click back
 * to a recent one), then only what has something to say: admin replies you
 * haven't read, your progress to the next milestone, queries still awaiting
 * review. A section with nothing in it isn't drawn: no zero tiles, no empty
 * cards. Each section loads and fails on its own.
 *
 * Cache keys sit under the same prefixes the other screens invalidate
 * (["user","issues"], ["user","queries"]), so reading a reply or raising a
 * query updates this page too. The unread count is the header badge's own
 * query, not a second request.
 */
export function LandingPage() {
  const { identity } = useAuth();
  const firstName = identity?.displayName.split(" ")[0] ?? identity?.displayName ?? "there";

  // Also warms the Workspace: "New lookup" opens with its lists already loaded.
  const navQuery = useQuery({
    queryKey: ["user", "navigation"],
    queryFn: fetchWorkspaceNav,
    retry: false,
  });
  const { entries } = useRecentLookups(identity?.id);
  const recentItems = navQuery.data ? resolveRecentLookups(entries, navQuery.data) : [];

  const unreadCount = useQuery({
    queryKey: ["user", "issues", "unread-count"],
    queryFn: fetchIssueUnreadCount,
    refetchInterval: 30_000,
  });
  const issuesQuery = useQuery({
    queryKey: ["user", "issues", "landing"],
    queryFn: () => fetchOwnIssues({ limit: 20 }),
  });
  const queriesQuery = useQuery({
    queryKey: ["user", "queries", "landing"],
    queryFn: () => fetchOwnQueries({ limit: LATEST_QUERIES }),
  });

  const unreadIssues = (issuesQuery.data?.items ?? []).filter((issue) => issue.unread);
  const pending = (queriesQuery.data?.items ?? []).filter((q) => q.status === "pending");
  // Page 1 holds every pending query only when there is no page 2.
  const pendingComplete = queriesQuery.data?.nextCursor === null;

  const state = stateSentence(unreadCount.data?.count, pending.length, pendingComplete);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-serif text-h1 text-ink">Welcome back, {firstName}</h1>
        {state && <p className="mt-1 text-body text-ink">{state}</p>}
        <p className="mt-1 text-body text-muted">
          {recentItems.length > 0
            ? "Pick up a recent lookup, or start a new one."
            : "Choose a bank, loan type and status to see where a loan stands."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex max-w-2xl flex-col items-start gap-6">
          <Link to="/user/workspace">
            <Button variant="primary">New lookup</Button>
          </Link>
          <RecentLookups items={recentItems} className="w-full" />
        </div>

        <div className="flex flex-col gap-8">
          <RepliesSection query={issuesQuery} items={unreadIssues} />
          <CreditProgress />
          <PendingSection query={queriesQuery} items={pending} />
        </div>
      </div>
    </div>
  );
}

/** "1 reply from an admin. 2 queries awaiting review." Null when neither applies. */
function stateSentence(
  unreadReplies: number | undefined,
  pendingOnFirstPage: number,
  pendingComplete: boolean,
): string | null {
  const parts: string[] = [];
  if (unreadReplies) {
    parts.push(
      `${String(unreadReplies)} ${unreadReplies === 1 ? "reply" : "replies"} from an admin.`,
    );
  }
  if (pendingOnFirstPage > 0) {
    parts.push(
      pendingComplete
        ? `${String(pendingOnFirstPage)} ${pendingOnFirstPage === 1 ? "query" : "queries"} awaiting review.`
        : "Queries awaiting review.",
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function RepliesSection({ query, items }: { query: LoadState; items: IssueSummary[] }) {
  if (query.isError) {
    return (
      <RailSection title="Replies for you">
        <LoadFailed what="your help requests" query={query} />
      </RailSection>
    );
  }
  if (items.length === 0) return null;
  return (
    <RailSection
      title="Replies for you"
      action={
        <Link to="/user/help" className="text-small text-brand-ink underline">
          All requests
        </Link>
      }
    >
      <ul className="divide-y divide-muted/10 overflow-hidden rounded-md bg-white shadow-card">
        {items.slice(0, LIST_LIMIT).map((issue) => (
          <li key={issue.id}>
            <Link to={`/user/help/${issue.id}`} className="block px-4 py-2.5 hover:bg-ink/5">
              <span className="block text-body font-medium text-ink">{issue.subject}</span>
              <span className="block text-small text-muted">
                Admin replied {formatRelativeTime(issue.lastActivityAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </RailSection>
  );
}

function PendingSection({ query, items }: { query: LoadState; items: QueryRow[] }) {
  if (query.isError) {
    return (
      <RailSection title="Awaiting review">
        <LoadFailed what="your queries" query={query} />
      </RailSection>
    );
  }
  if (items.length === 0) return null;
  return (
    <RailSection
      title="Awaiting review"
      action={
        <Link to="/user/queries" className="text-small text-brand-ink underline">
          All queries
        </Link>
      }
    >
      <ul className="divide-y divide-muted/10 overflow-hidden rounded-md bg-white shadow-card">
        {items.slice(0, LIST_LIMIT).map((q) => (
          <li key={q.id} className="px-4 py-2.5">
            <span className="block truncate text-small text-muted">
              {q.bankNameSnapshot} · {q.loanTypeNameSnapshot}
            </span>
            <span className="block text-body font-medium text-ink">{q.statusNameSnapshot}</span>
            <span className="block text-small text-muted">
              Raised {formatRelativeTime(q.raisedAt)}
            </span>
          </li>
        ))}
      </ul>
    </RailSection>
  );
}
