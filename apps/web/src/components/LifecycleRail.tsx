import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { lifecycleWindow } from "../lib/lifecycleWindow";
import { workspaceHref } from "../lib/recentLookups";
import { fetchDescription } from "../lib/userApi";
import { RailSection } from "./RailSection";

const NA_BODY = "NA";

interface Step {
  id: string;
  name: string;
}

/**
 * The statuses around the one being viewed, for the same bank and loan type:
 * two before and three after (step 8 shows 6-11; the window slides at the
 * ends, see lifecycleWindow), each one click from its lookup, with the
 * previous and next steps previewed. A loan moves step to step, and this is
 * what comes before and after without three more lookups. "All N steps"
 * opens the whole ordered list.
 *
 * The previews never hold up the result: they're separate queries, enabled
 * only once the main description has arrived (`ready`). They share the main
 * lookup's query key, so opening the next step afterwards is instant from
 * cache.
 */
export function LifecycleRail({
  steps,
  current,
  bankId,
  loanTypeId,
  ready,
}: {
  /** The whole lifecycle, in order. */
  steps: Step[];
  /** Index of the step being viewed. */
  current: number;
  bankId: string;
  loanTypeId: string;
  /** True once the main description has arrived. */
  ready: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const { start, end } = lifecycleWindow(steps.length, current);
  const shown = showAll ? steps : steps.slice(start, end);
  const offset = showAll ? 0 : start;
  const previous = steps[current - 1];
  const next = steps[current + 1];

  return (
    <RailSection
      title="In this lifecycle"
      action={
        steps.length > end - start ? (
          <button
            type="button"
            className="text-small text-brand-ink underline"
            aria-expanded={showAll}
            onClick={() => {
              setShowAll((v) => !v);
            }}
          >
            {showAll ? "Show nearby steps" : `All ${String(steps.length)} steps`}
          </button>
        ) : undefined
      }
    >
      <ol
        className={`divide-y divide-muted/10 overflow-hidden rounded-md bg-white shadow-card ${
          showAll ? "max-h-[28rem] overflow-y-auto" : ""
        }`}
      >
        {shown.map((step, i) => {
          const index = offset + i;
          const label = `Step ${String(index + 1)} of ${String(steps.length)}`;
          if (index === current) {
            return (
              <li
                key={step.id}
                aria-current="step"
                className="border-l-[3px] border-brand-ink bg-brand/10 px-4 py-2"
              >
                <span className="block text-small text-muted">{label} · viewing</span>
                <span className="block text-body font-semibold text-ink">{step.name}</span>
              </li>
            );
          }
          const neighbour = step.id === previous?.id || step.id === next?.id;
          return (
            <li key={step.id}>
              <Link
                to={workspaceHref({ bankId, loanTypeId, statusId: step.id })}
                className="block px-4 py-2 hover:bg-ink/5"
              >
                <span className="block text-small text-muted">{label}</span>
                <span className="block text-body text-ink">{step.name}</span>
                {neighbour && !showAll && (
                  <Preview
                    bankId={bankId}
                    loanTypeId={loanTypeId}
                    statusId={step.id}
                    enabled={ready}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </RailSection>
  );
}

/** Two lines of a neighbouring step's description, once the main result is in. */
function Preview({
  bankId,
  loanTypeId,
  statusId,
  enabled,
}: {
  bankId: string;
  loanTypeId: string;
  statusId: string;
  enabled: boolean;
}) {
  const query = useQuery({
    // The main lookup's key, so opening this step later is served from cache.
    queryKey: ["user", "description", bankId, loanTypeId, statusId],
    queryFn: () => fetchDescription(bankId, loanTypeId, statusId),
    enabled,
  });
  if (!query.data) return null;
  return (
    <span className="mt-0.5 line-clamp-2 block text-small text-muted" data-testid="step-preview">
      {query.data.body === NA_BODY ? "No description yet." : query.data.body}
    </span>
  );
}
