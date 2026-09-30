import { useQuery } from "@tanstack/react-query";
import type { ActivityEvent } from "@way-to-credit/shared";
import { Link } from "react-router-dom";
import { Badge, type BadgeTone } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Spinner } from "../../components/Spinner";
import { fetchActivityLog, fetchAdminQueries, fetchStats } from "../../lib/adminApi";
import { formatIstDateTime } from "../../lib/format";
import { activityActor } from "../../lib/useActorNames";
import { useAuth } from "../../lib/auth";
import { ActorLabel } from "../../components/ActorLabel";

const REFRESH_MS = 30_000;

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

export function DashboardPage() {
  const { identity } = useAuth();
  const statsQuery = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: fetchStats,
    refetchInterval: REFRESH_MS,
  });
  const activityQuery = useQuery({
    queryKey: ["admin", "activity", "recent"],
    queryFn: () => fetchActivityLog({ limit: 5 }),
  });
  const pendingQuery = useQuery({
    queryKey: ["admin", "queries", "oldestPending"],
    queryFn: () => fetchAdminQueries({ status: "pending", sort: "asc", limit: 5 }),
  });

  return (
    <div className="flex flex-col gap-8 p-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">Dashboard</h1>
        <p className="mt-1 text-body text-muted">An overview of what needs attention today.</p>
      </div>

      {statsQuery.isPending && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" label="Loading stats" />
        </div>
      )}

      {statsQuery.isError && (
        <ErrorState
          message="We couldn't load the dashboard stats. Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => void statsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {statsQuery.data && (
        <div className="flex flex-col gap-6 border-b border-muted/15 pb-6 sm:flex-row sm:items-stretch">
          <Link
            to="/admin/queries"
            className="flex flex-col justify-center gap-1 rounded-sm pr-6 hover:bg-ink/5 sm:border-r sm:border-muted/15"
          >
            {/* Amber means "needs attention" — zero pending is the opposite,
                so an empty queue reads neutral, like the other stats. */}
            <span
              data-testid="pending-query-count"
              className={`text-h1 font-serif tabular-nums ${
                statsQuery.data.pendingQueryCount > 0 ? "text-attention" : "text-ink"
              }`}
            >
              {statsQuery.data.pendingQueryCount}
            </span>
            <span className="text-body font-medium text-ink">Pending queries</span>
            <span className="text-small text-muted">Needs admin action</span>
          </Link>

          {/* Help requests whose next move is an admin's: someone is waiting.
              Same rule as pending queries — amber only when non-zero. */}
          <Link
            to="/admin/help?status=awaiting_admin"
            className="flex flex-col justify-center gap-1 rounded-sm pr-6 hover:bg-ink/5 sm:border-r sm:border-muted/15"
          >
            <span
              data-testid="awaiting-issue-count"
              className={`text-h1 font-serif tabular-nums ${
                statsQuery.data.awaitingAdminIssueCount > 0 ? "text-attention" : "text-ink"
              }`}
            >
              {statsQuery.data.awaitingAdminIssueCount}
            </span>
            <span className="text-body font-medium text-ink">Awaiting reply</span>
            <span className="text-small text-muted">Help requests</span>
          </Link>

          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 sm:pl-6">
            <Stat label="Total users" value={statsQuery.data.totalUsers} />
            <Stat label="Active (5 min)" value={statsQuery.data.activeUsersLast5Minutes} />
            <Stat label="Banks" value={statsQuery.data.totalBanks} />
            <Stat label="Credits issued" value={statsQuery.data.totalCreditsIssued} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-h2 text-ink">Recent activity</h2>
            <Link
              to="/admin/activity"
              className="text-small font-medium text-brand-ink underline underline-offset-2"
            >
              View all
            </Link>
          </div>

          {activityQuery.isPending && (
            <div className="flex justify-center py-8">
              <Spinner label="Loading activity" />
            </div>
          )}
          {activityQuery.isError && (
            <ErrorState
              message="We couldn't load recent activity."
              action={
                <Button variant="secondary" onClick={() => void activityQuery.refetch()}>
                  Retry
                </Button>
              }
            />
          )}
          {activityQuery.data &&
            (activityQuery.data.items.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Logins and logouts will show up here."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-muted/10 rounded-md bg-white shadow-card">
                {activityQuery.data.items.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-body text-ink">
                        <ActorLabel actor={activityActor(row, identity?.id)} />
                      </span>
                      <span className="text-small text-muted">
                        {formatIstDateTime(row.occurredAt)} IST
                      </span>
                    </div>
                    <Badge tone={EVENT_TONE[row.event]} label={EVENT_LABEL[row.event]} />
                  </li>
                ))}
              </ul>
            ))}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-h2 text-ink">Oldest pending queries</h2>
            <Link
              to="/admin/queries"
              className="text-small font-medium text-brand-ink underline underline-offset-2"
            >
              View all
            </Link>
          </div>

          {pendingQuery.isPending && (
            <div className="flex justify-center py-8">
              <Spinner label="Loading pending queries" />
            </div>
          )}
          {pendingQuery.isError && (
            <ErrorState
              message="We couldn't load pending queries."
              action={
                <Button variant="secondary" onClick={() => void pendingQuery.refetch()}>
                  Retry
                </Button>
              }
            />
          )}
          {pendingQuery.data &&
            (pendingQuery.data.items.length === 0 ? (
              <EmptyState
                title="You're caught up"
                description="There are no pending queries right now."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-muted/10 rounded-md bg-white shadow-card">
                {pendingQuery.data.items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1 px-4 py-3">
                    <Link
                      to="/admin/queries"
                      className="text-body font-medium text-ink hover:text-brand-ink"
                    >
                      {item.bankNameSnapshot} · {item.loanTypeNameSnapshot} ·{" "}
                      {item.statusNameSnapshot}
                    </Link>
                    <span className="text-small text-muted">
                      Raised {formatIstDateTime(item.raisedAt)} IST
                    </span>
                  </li>
                ))}
              </ul>
            ))}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-h2 font-serif text-ink tabular-nums">{value}</span>
      <span className="text-small text-muted">{label}</span>
    </div>
  );
}
