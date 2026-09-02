import {
  useQuery,
  useQueryClient,
  useInfiniteQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import type { AdminListQueriesResponse, AdminQueryRow, QueryStatus } from "@way-to-credit/shared";
import { useState } from "react";
import { Badge, type BadgeTone } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { approveQuery, fetchAdminQueries, fetchUsers, rejectQuery } from "../../lib/adminApi";
import { formatIstDateTime } from "../../lib/format";
import { istDayRangeUtc } from "../../lib/ist";

const PAGE_SIZE = 20;

const STATUS_TONE: Record<QueryStatus, BadgeTone> = {
  pending: "attention",
  approved: "success",
  rejected: "negative",
};
const STATUS_LABEL: Record<QueryStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export function QueriesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<QueryStatus | "">("pending");
  const [userId, setUserId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: fetchUsers });

  const from = fromDate ? istDayRangeUtc(fromDate).fromUtc : undefined;
  const to = toDate ? istDayRangeUtc(toDate).toUtc : undefined;

  const queryKey = ["admin", "queries", "inbox", status, userId, from, to] as const;

  const listQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchAdminQueries({
        ...(status ? { status } : {}),
        ...(userId ? { userId } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];

  async function handleAction(queryId: string, action: "approve" | "reject") {
    setPendingIds((prev) => new Set(prev).add(queryId));
    try {
      const updated =
        action === "approve" ? await approveQuery(queryId) : await rejectQuery(queryId);
      queryClient.setQueryData<InfiniteData<AdminListQueriesResponse>>(queryKey, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((item) => (item.id === queryId ? updated : item)),
              })),
            }
          : old,
      );
      showToast(
        action === "approve" ? "Query approved — 1 credit awarded." : "Query rejected.",
        "success",
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "ALREADY_RESOLVED") {
        showToast("Someone else already resolved this query.", "info");
        await listQuery.refetch();
      } else {
        showToast(err instanceof ApiError ? err.message : "Something went wrong.", "error");
      }
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(queryId);
        return next;
      });
    }
  }

  const userOptions = (usersQuery.data ?? []).map((u) => ({ value: u.id, label: u.displayName }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">Query inbox</h1>
        <p className="mt-1 text-body text-slate">
          Approving a query awards the user 1 credit point. Newest first.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as QueryStatus | "");
          }}
          options={[
            { value: "", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
        <Select
          label="User"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
          }}
          placeholder="All users"
          options={userOptions}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-body font-medium text-ink">From</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
            }}
            className="rounded-sm border border-slate/40 bg-white px-3 py-2 text-body text-ink"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-body font-medium text-ink">To</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
            }}
            className="rounded-sm border border-slate/40 bg-white px-3 py-2 text-body text-ink"
          />
        </label>
      </div>

      {listQuery.isPending && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Loading queries" />
        </div>
      )}

      {listQuery.isError && (
        <ErrorState
          message="We couldn't load queries. Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => void listQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {listQuery.isSuccess && items.length === 0 && (
        <EmptyState
          title={status === "pending" ? "You're caught up" : "No queries match these filters"}
          description={
            status === "pending"
              ? "There are no pending queries right now."
              : "Try a different status, user, or date range."
          }
        />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-slate/15">
          {items.map((item) => (
            <QueryRow
              key={item.id}
              item={item}
              pending={pendingIds.has(item.id)}
              onApprove={() => void handleAction(item.id, "approve")}
              onReject={() => void handleAction(item.id, "reject")}
            />
          ))}
        </ul>
      )}

      {listQuery.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            loading={listQuery.isFetchingNextPage}
            onClick={() => void listQuery.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function QueryRow({
  item,
  pending,
  onApprove,
  onReject,
}: {
  item: AdminQueryRow;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body font-medium text-ink">
          {item.bankNameSnapshot} · {item.loanTypeNameSnapshot} · {item.statusNameSnapshot}
        </p>
        <Badge tone={STATUS_TONE[item.status]} label={STATUS_LABEL[item.status]} />
      </div>
      <p className="text-body text-ink">{item.message}</p>
      <p className="text-small text-slate">
        Raised {formatIstDateTime(item.raisedAt)} IST · raised by{" "}
        <span className="font-mono">{item.raisedBy.slice(0, 8)}</span>
      </p>
      {item.status === "pending" && (
        <div className="mt-1 flex items-center gap-2">
          <Button variant="primary" loading={pending} disabled={pending} onClick={onApprove}>
            Approve (+1 credit)
          </Button>
          <Button variant="danger" loading={pending} disabled={pending} onClick={onReject}>
            Reject
          </Button>
        </div>
      )}
    </li>
  );
}
