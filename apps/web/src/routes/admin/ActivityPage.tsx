import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ActivityEvent } from "@way-to-credit/shared";
import { useState } from "react";
import { Badge, type BadgeTone } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../components/Table";
import { fetchActiveSessions, fetchActivityLog, fetchUsers } from "../../lib/adminApi";
import { formatIstDateTime } from "../../lib/format";
import { istDayRangeUtc } from "../../lib/ist";

const PAGE_SIZE = 20;
const SESSIONS_REFRESH_MS = 30_000;

const EVENT_TONE: Record<ActivityEvent, BadgeTone> = {
  login: "success",
  logout: "neutral",
  forced_logout: "negative",
};
const EVENT_LABEL: Record<ActivityEvent, string> = {
  login: "Login",
  logout: "Logout",
  forced_logout: "Forced logout",
};

export function ActivityPage() {
  return (
    <div className="flex flex-col gap-8 p-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">Activity</h1>
        <p className="mt-1 text-body text-slate">Login history and who&apos;s online right now.</p>
      </div>

      <ActiveSessionsSection />
      <ActivityLogSection />
    </div>
  );
}

function ActiveSessionsSection() {
  const sessionsQuery = useQuery({
    queryKey: ["admin", "sessions", "active"],
    queryFn: fetchActiveSessions,
    refetchInterval: SESSIONS_REFRESH_MS,
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-h2 text-ink">Active sessions</h2>

      {sessionsQuery.isPending && (
        <div className="flex justify-center py-8">
          <Spinner label="Loading active sessions" />
        </div>
      )}
      {sessionsQuery.isError && (
        <ErrorState
          message="We couldn't load active sessions."
          action={
            <Button variant="secondary" onClick={() => void sessionsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}
      {sessionsQuery.data &&
        (sessionsQuery.data.length === 0 ? (
          <EmptyState
            title="No one's online"
            description="No user has an active session right now."
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>User ID</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Last seen</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessionsQuery.data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono">{s.userId}</TableCell>
                  <TableCell>{s.displayName}</TableCell>
                  <TableCell className="text-small text-slate">
                    {s.lastSeenAt ? `${formatIstDateTime(s.lastSeenAt)} IST` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
    </section>
  );
}

function ActivityLogSection() {
  const [actorId, setActorId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: fetchUsers });

  const from = fromDate ? istDayRangeUtc(fromDate).fromUtc : undefined;
  const to = toDate ? istDayRangeUtc(toDate).toUtc : undefined;

  const logQuery = useInfiniteQuery({
    queryKey: ["admin", "activity", "log", actorId, from, to],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchActivityLog({
        ...(actorId ? { actorId } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = logQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const userOptions = (usersQuery.data ?? []).map((u) => ({ value: u.id, label: u.displayName }));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-h2 text-ink">Login history</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Select
          label="User"
          value={actorId}
          onChange={(e) => {
            setActorId(e.target.value);
          }}
          placeholder="All users and admins"
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

      {logQuery.isPending && (
        <div className="flex justify-center py-8">
          <Spinner label="Loading activity" />
        </div>
      )}
      {logQuery.isError && (
        <ErrorState
          message="We couldn't load the activity log."
          action={
            <Button variant="secondary" onClick={() => void logQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}
      {logQuery.isSuccess && items.length === 0 && (
        <EmptyState title="No activity" description="No logins or logouts match these filters." />
      )}

      {items.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Actor</TableHeaderCell>
              <TableHeaderCell>Event</TableHeaderCell>
              <TableHeaderCell>When</TableHeaderCell>
              <TableHeaderCell>IP</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {row.actorType === "admin" ? "Admin" : "User"}{" "}
                  <span className="font-mono text-small text-slate">{row.actorId.slice(0, 8)}</span>
                </TableCell>
                <TableCell>
                  <Badge tone={EVENT_TONE[row.event]} label={EVENT_LABEL[row.event]} />
                </TableCell>
                <TableCell className="text-small text-slate">
                  {formatIstDateTime(row.occurredAt)} IST
                </TableCell>
                <TableCell className="text-small text-slate">{row.ip ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {logQuery.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            loading={logQuery.isFetchingNextPage}
            onClick={() => void logQuery.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}
