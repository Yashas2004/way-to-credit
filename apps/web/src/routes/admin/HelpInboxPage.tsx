import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { IssueStatusFilterSchema, type IssueStatusFilter } from "@way-to-credit/shared";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ISSUE_STATUS_BADGE } from "../../components/issueStatus";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import { fetchAdminIssues, fetchUsers } from "../../lib/adminApi";
import { dedupeById } from "../../lib/dedupeById";
import { formatIstDateTime } from "../../lib/format";

const PAGE_SIZE = 20;
const POLL_MS = 30_000;

const STATUS_OPTIONS: { value: IssueStatusFilter | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "open", label: "Open (either side)" },
  { value: "awaiting_admin", label: "Needs a reply" },
  { value: "awaiting_user", label: "Waiting for the user" },
  { value: "resolved", label: "Resolved" },
];

/**
 * The admin help-request inbox, by last activity. Filters live in the URL
 * (?status=&userId=) so the dashboard can link straight to "needs a reply".
 *
 * The pages are keyset-paginated on last activity, which only moves
 * forward: a request that gets activity while you page jumps to the top,
 * so a later page skips it (it can't repeat it), and it surfaces when the
 * 30-second poll refetches every loaded page from the top. dedupeById is
 * defence in depth so a duplicate can never render as two rows.
 */
export function HelpInboxPage() {
  const [params, setParams] = useSearchParams();
  const parsedStatus = IssueStatusFilterSchema.safeParse(params.get("status"));
  const status = parsedStatus.success ? parsedStatus.data : undefined;
  const userId = params.get("userId") ?? "";

  function setFilter(key: "status" | "userId", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const usersQuery = useQuery({
    queryKey: ["admin", "users", "include"],
    queryFn: () => fetchUsers("include"),
  });
  const list = useInfiniteQuery({
    queryKey: ["admin", "issues", "list", status, userId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchAdminIssues({
        ...(status ? { status } : {}),
        ...(userId ? { userId } : {}),
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: POLL_MS,
  });
  const items = list.data ? dedupeById(list.data.pages) : [];
  const userOptions = (usersQuery.data ?? []).map((u) => ({
    value: u.id,
    label: u.archivedAt ? `${u.displayName} (archived)` : u.displayName,
  }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">Help requests</h1>
        <p className="mt-1 text-body text-muted">
          Conversations users started from the Help button. Most recent activity first.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Select
          label="Status"
          value={status ?? ""}
          onChange={(e) => {
            setFilter("status", e.target.value);
          }}
          options={STATUS_OPTIONS}
        />
        <Select
          label="User"
          value={userId}
          onChange={(e) => {
            setFilter("userId", e.target.value);
          }}
          placeholder="All users"
          options={userOptions}
        />
      </div>

      {list.isPending && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Loading help requests" />
        </div>
      )}

      {list.isError && (
        <ErrorState
          message="We couldn't load help requests. Try again."
          action={
            <Button variant="secondary" onClick={() => void list.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {list.isSuccess && items.length === 0 && (
        <EmptyState title="Nothing here" description="No help requests match these filters." />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-muted/10 border-y border-muted/20">
          {items.map((item) => {
            const badge = ISSUE_STATUS_BADGE.admin[item.status];
            return (
              <li key={item.id} data-testid="issue-row">
                <Link
                  to={`/admin/help/${item.id}`}
                  className="flex flex-col gap-1 px-3 py-2.5 hover:bg-ink/5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p
                      className={`truncate text-body text-ink ${item.unread ? "font-semibold" : ""}`}
                    >
                      {item.unread && (
                        <>
                          <span
                            aria-hidden="true"
                            className="mr-2 inline-block h-2 w-2 rounded-full bg-brand-ink align-middle"
                          />
                          <span className="sr-only">Unread: </span>
                        </>
                      )}
                      {item.subject}
                    </p>
                    <p className="text-small text-muted">
                      {item.raisedByDisplayName} ({item.raisedByUserId}) ·{" "}
                      {formatIstDateTime(item.lastActivityAt)} IST
                      {item.unread && " · New message"}
                    </p>
                  </div>
                  <Badge tone={badge.tone} label={badge.label} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {list.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
