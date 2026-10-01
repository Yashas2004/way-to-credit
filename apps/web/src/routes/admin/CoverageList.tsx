import { useQuery } from "@tanstack/react-query";
import { fetchDescriptionCoverage } from "../../lib/adminApi";

const LIMIT = 10;

/**
 * Where descriptions are missing: the pairs with the most statuses still
 * "NA", worst first, each one click from opening that pair. With a bank
 * chosen, that bank's loan types instead. Filling in descriptions is the
 * admin's main job, and this is where to start. Nothing is drawn while it
 * loads; a failure says so in one line.
 */
export function CoverageList({
  bankId,
  bankName,
  onPick,
}: {
  bankId?: string;
  bankName?: string;
  onPick: (bankId: string, loanTypeId: string) => void;
}) {
  const query = useQuery({
    queryKey: ["admin", "descriptionCoverage", bankId ?? "all"],
    queryFn: () => fetchDescriptionCoverage({ ...(bankId ? { bankId } : {}), limit: LIMIT }),
  });

  if (query.isError) {
    return (
      <p className="text-small text-muted">
        Couldn't load where descriptions are missing.{" "}
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
  const data = query.data;
  if (!data || data.pairs.length === 0) return null;

  const heading = bankId
    ? `${bankName ?? "This bank"}: loan types, most missing first`
    : "Where descriptions are missing";
  return (
    <section aria-labelledby="coverage-heading" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="coverage-heading" className="text-h3 font-semibold text-muted">
          {heading}
        </h2>
        <p className="text-small text-muted">
          {data.missingTotal === 0
            ? `Every ${data.pairCount === 1 ? "pair has" : "one of these pairs has"} all ${String(data.totalStatuses)} descriptions.`
            : `${data.missingTotal.toLocaleString("en-IN")} missing across ${data.pairCount.toLocaleString("en-IN")} pair${data.pairCount === 1 ? "" : "s"} · ${String(data.totalStatuses)} statuses each`}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-muted/10 overflow-hidden rounded-md bg-white shadow-card">
        {data.pairs.map((pair) => {
          const share = data.totalStatuses ? pair.filled / data.totalStatuses : 0;
          return (
            <li key={`${pair.bankId}/${pair.loanTypeId}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(pair.bankId, pair.loanTypeId);
                }}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 px-4 py-2 text-left hover:bg-ink/5 sm:grid-cols-[minmax(0,1fr)_8rem_9rem]"
              >
                <span className="min-w-0 truncate text-body text-ink">
                  {bankId ? pair.loanTypeName : `${pair.bankName} · ${pair.loanTypeName}`}
                </span>
                {/* Filled share: a progress fill, so `brand` with a muted track. */}
                <span
                  aria-hidden="true"
                  className="hidden h-1.5 overflow-hidden rounded-full bg-muted/15 sm:block"
                >
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${String(Math.round(share * 100))}%` }}
                  />
                </span>
                <span className="text-right text-small text-muted">
                  {pair.missing === 0
                    ? "Complete"
                    : `${String(pair.missing)} of ${String(data.totalStatuses)} missing`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
