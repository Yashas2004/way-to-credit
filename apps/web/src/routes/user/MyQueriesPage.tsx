import { useInfiniteQuery } from "@tanstack/react-query";
import type { QueryStatus } from "@way-to-credit/shared";
import { Link } from "react-router-dom";
import { Badge, type BadgeTone } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Spinner } from "../../components/Spinner";
import { fetchOwnQueries } from "../../lib/userApi";

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

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">My queries</h1>
        <p className="mt-1 text-body text-slate">Newest first.</p>
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
        <ul className="flex flex-col divide-y divide-slate/15 rounded-md border border-slate/20 bg-white">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body font-medium text-ink">
                  {item.bankNameSnapshot} · {item.loanTypeNameSnapshot} · {item.statusNameSnapshot}
                </p>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[item.status]} label={STATUS_LABEL[item.status]} />
                  {item.status === "approved" && (
                    <span className="text-small font-medium text-moss">+1 credit</span>
                  )}
                </div>
              </div>
              <p className="text-body text-ink">{item.message}</p>
              <p className="text-small text-slate">
                Raised {dateFormatter.format(new Date(item.raisedAt))} IST
              </p>
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
