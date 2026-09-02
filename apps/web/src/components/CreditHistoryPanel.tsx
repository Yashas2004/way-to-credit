import { useQuery } from "@tanstack/react-query";
import { queriesContributingToMilestone } from "../lib/creditHistory";
import { fetchCreditHistory } from "../lib/userApi";
import { Button } from "./Button";
import { ErrorState } from "./ErrorState";
import { Spinner } from "./Spinner";

export interface CreditHistoryPanelProps {
  id: string;
  previousThreshold: number;
  threshold: number;
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * "How you earned this" — the record of a past milestone's row, expanded.
 * A generous single page (100 rows) covers this app's realistic scale in
 * one request; see creditHistory.ts for the accepted limitation on a
 * longer ledger. Shared across every open panel via one query key, so
 * expanding a second seal never issues a second fetch.
 */
export function CreditHistoryPanel({ id, previousThreshold, threshold }: CreditHistoryPanelProps) {
  const query = useQuery({
    queryKey: ["user", "creditHistory"],
    queryFn: () => fetchCreditHistory({ limit: 100 }),
  });

  const contributing = query.data
    ? queriesContributingToMilestone(query.data.items, previousThreshold, threshold)
    : [];

  return (
    <div id={id} className="mt-3 rounded-sm border border-slate/20 bg-paper/60 px-4 py-3.5">
      <p className="mb-2 text-small font-medium text-ink">How you earned this</p>

      {query.isPending && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" label="Loading your query history" />
        </div>
      )}

      {query.isError && (
        <ErrorState
          message="We couldn't load your query history."
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {query.isSuccess && contributing.length === 0 && (
        <p className="text-small text-slate">
          These points came from a credit adjustment rather than a specific query.
        </p>
      )}

      {contributing.length > 0 && (
        <ul className="flex flex-col divide-y divide-slate/15">
          {contributing.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-small text-ink">
                {entry.bankNameSnapshot} — {entry.loanTypeNameSnapshot}
              </span>
              <span className="text-small text-slate">
                {dateFormatter.format(new Date(entry.createdAt))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
