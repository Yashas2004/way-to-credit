import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { QueryStatus } from "@way-to-credit/shared";
import { Link } from "react-router-dom";
import { Badge, type BadgeTone } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Spinner } from "../../components/Spinner";
import { isAvailable, workspaceHref } from "../../lib/recentLookups";
import { fetchOwnQueries, fetchWorkspaceNav } from "../../lib/userApi";

const STATUS_TONE: Record<QueryStatus, BadgeTone> = {
  pending: "neutral",
  approved: "success",
  rejected: "negative",
};

const STATUS_LABEL: Record<QueryStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const dayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
});

const PAGE_SIZE = 20;

export function MyQueriesPage() {
  const query = useInfiniteQuery({
    queryKey: ["user", "queries"],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchOwnQueries({ limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  // For the "Look up" links: shared with the Workspace (and usually cached).
  // Rows whose bank, loan type or status has since been withdrawn get none.
  const navQuery = useQuery({
    queryKey: ["user", "navigation"],
    queryFn: fetchWorkspaceNav,
    retry: false,
  });
  const nav = navQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">My queries</h1>
        <p className="mt-1 text-body text-muted">Newest first.</p>
      </div>

      {query.isPending && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Loading your queries" />
        </div>
      )}

      {query.isError && (
        <ErrorState
          message="We couldn't load your queries. Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {query.isSuccess && items.length === 0 && (
        <EmptyState
          title="No queries yet"
          description="Raise a query from the workspace when a description is missing or unclear."
          action={
            <Link to="/user/workspace">
              <Button variant="primary">Go to workspace</Button>
            </Link>
          }
        />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-muted/10 rounded-md bg-white shadow-card">
          {/* One scannable grid from md up: what and why | outcome | when.
              Below md the three stack, outcome and date sharing a line. */}
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 px-4 py-3 md:grid md:grid-cols-[minmax(0,1fr)_10rem_12rem] md:items-start md:gap-6"
            >
              {/* The status and its combination on one line, then the message:
                  two lines of text before the message instead of three, and
                  "Look up" sits under the date rather than on a line of its own. */}
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-body font-medium text-ink">{item.statusNameSnapshot}</span>
                  <span aria-hidden="true" className="text-small text-muted">
                    ·
                  </span>
                  <span className="text-small text-muted">
                    {item.bankNameSnapshot} · {item.loanTypeNameSnapshot}
                  </span>
                </p>
                <p className="mt-1 max-w-[66ch] text-body text-ink">{item.message}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[item.status]} label={STATUS_LABEL[item.status]} />
                {item.status === "approved" && (
                  <span className="text-small font-medium text-positive">+1 credit</span>
                )}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-small text-muted md:block md:text-right">
                {/* Never wraps: in a 9rem column "2:33 pm IST" broke across lines. */}
                <p className="whitespace-nowrap">
                  <span className="sr-only">Raised </span>
                  {dayFormatter.format(new Date(item.raisedAt))},{" "}
                  {timeFormatter.format(new Date(item.raisedAt))} IST
                </p>
                {nav && isAvailable(nav, item) && (
                  <Link
                    to={workspaceHref(item)}
                    className="text-brand-ink underline"
                    aria-label={`Look up ${item.statusNameSnapshot} at ${item.bankNameSnapshot}, ${item.loanTypeNameSnapshot}`}
                  >
                    Look up
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
