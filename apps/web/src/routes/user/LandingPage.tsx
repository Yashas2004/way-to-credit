import { useQuery } from "@tanstack/react-query";
import type { IssueSummary, QueryRow, RewardsMapResponse } from "@way-to-credit/shared";
import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { RecentLookups } from "../../components/RecentLookups";
import { SequenceDots } from "../../components/SequenceDots";
import { Spinner } from "../../components/Spinner";
import { useAuth } from "../../lib/auth";
import { formatRelativeTime } from "../../lib/format";
import { resolveRecentLookups, useRecentLookups } from "../../lib/recentLookups";
import {
  fetchIssueUnreadCount,
  fetchOwnIssues,
  fetchOwnQueries,
  fetchRewardsMap,
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
  const rewardsQuery = useQuery({ queryKey: ["user", "rewards"], queryFn: fetchRewardsMap });

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
          <ProgressSection query={rewardsQuery} />
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

interface LoadState {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="text-h3 font-medium text-muted">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function LoadFailed({ what, query }: { what: string; query: LoadState }) {
  return (
    <p className="text-small text-muted">
      Couldn't load {what}.{" "}
      <button
        type="button"
        className="text-brand-ink underline"
        onClick={() => void query.refetch()}
      >
        Retry
      </button>
    </p>
  );
}

function RepliesSection({ query, items }: { query: LoadState; items: IssueSummary[] }) {
  if (query.isError) {
    return (
      <Section title="Replies for you">
        <LoadFailed what="your help requests" query={query} />
      </Section>
    );
  }
  if (items.length === 0) return null;
  return (
    <Section
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
    </Section>
  );
}

function ProgressSection({
  query,
}: {
  query: LoadState & { data?: RewardsMapResponse | undefined };
}) {
  const action = (
    <Link to="/user/rewards" className="text-small text-brand-ink underline">
      Rewards map
    </Link>
  );
  if (query.isPending) {
    return (
      <Section title="Your progress">
        <Spinner label="Loading your credit total" />
      </Section>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Section title="Your progress">
        <LoadFailed what="your credit total" query={query} />
      </Section>
    );
  }
  const { creditPoints, milestones } = query.data;
  const sorted = [...milestones].sort((a, b) => a.pointsRequired - b.pointsRequired);
  const next = sorted.find((m) => !m.unlockedAt);
  // The step runs from the last milestone reached to the next one.
  const from = Math.max(
    0,
    ...sorted
      .filter((m) => m.unlockedAt && m.pointsRequired <= creditPoints)
      .map((m) => m.pointsRequired),
  );

  return (
    <Section title="Your progress" action={action}>
      <p className="flex items-baseline gap-2">
        <span className="font-serif text-display text-brand-ink">{creditPoints}</span>
        <span className="text-body text-muted">credit point{creditPoints === 1 ? "" : "s"}</span>
      </p>
      {next ? (
        <SequenceDots
          className="mt-2"
          value={creditPoints - from}
          total={next.pointsRequired - from}
          label={`${String(Math.min(creditPoints, next.pointsRequired) - from)} of ${String(next.pointsRequired - from)} toward ${next.title}`}
        />
      ) : (
        <p className="mt-2 text-small text-muted">
          {sorted.length > 0 ? "Every milestone unlocked." : "No milestones set up yet."}
        </p>
      )}
      {creditPoints === 0 && (
        <p className="mt-2 text-small text-muted">Each query an admin approves earns 1 point.</p>
      )}
    </Section>
  );
}

function PendingSection({ query, items }: { query: LoadState; items: QueryRow[] }) {
  if (query.isError) {
    return (
      <Section title="Awaiting review">
        <LoadFailed what="your queries" query={query} />
      </Section>
    );
  }
  if (items.length === 0) return null;
  return (
    <Section
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
    </Section>
  );
}
