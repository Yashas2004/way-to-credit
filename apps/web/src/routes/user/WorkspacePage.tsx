import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Combobox } from "../../components/Combobox";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { CreditProgress } from "../../components/CreditProgress";
import { RecentLookups } from "../../components/RecentLookups";
import { YourQueries } from "../../components/YourQueries";
import { SequenceDots } from "../../components/SequenceDots";
import { Spinner } from "../../components/Spinner";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  isAvailable,
  resolveRecentLookups,
  sameTriple,
  tripleFromParams,
  useRecentLookups,
  workspaceHref,
  type Triple,
} from "../../lib/recentLookups";
import { fetchDescription, fetchWorkspaceNav } from "../../lib/userApi";
import { RaiseQueryModal, type RaiseQueryContext } from "./RaiseQueryModal";

const NA_BODY = "NA";

/**
 * Choose a bank, loan type and status with three typeahead comboboxes, then
 * ask for the description: "Show description" or Enter. Nothing loads before
 * that, so changing your mind costs nothing. The description query is keyed
 * to the *submitted* triple, not the live selection: change a selection
 * after a description is shown and it stays visible, marked stale, until you
 * ask again. It is never silently swapped for a different combination.
 *
 * The shown combination lives in the URL (?bank=&loanType=&status=), so a
 * recent lookup or a My queries row can link straight to it, and Back and
 * Forward move between lookups. Opening such a link is the request: it shows
 * that description once. Each successful lookup is remembered in the
 * per-browser recent list (lib/recentLookups.ts).
 */
export function WorkspacePage() {
  // No retry: a failed or timed-out navigation load says so at once, rather
  // than retrying behind a spinner (a 5 s timeout retried once kept users
  // waiting 12 s to learn something was wrong). The Retry button is right there.
  const navQuery = useQuery({
    queryKey: ["user", "navigation"],
    queryFn: fetchWorkspaceNav,
    retry: false,
  });
  const [bankId, setBankId] = useState("");
  const [loanTypeId, setLoanTypeId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [submitted, setSubmitted] = useState<Triple | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [linkUnavailable, setLinkUnavailable] = useState(false);
  // The URL params last applied to (or written from) the form, so a URL
  // change is applied once and our own writes aren't re-applied.
  const appliedParams = useRef<string | null>(null);
  const { identity } = useAuth();
  const recent = useRecentLookups(identity?.id);

  const nav = navQuery.data;
  const banks = nav?.banks ?? [];
  const selectedBank = banks.find((b) => b.id === bankId);
  const loanTypes = useMemo(
    () =>
      nav && selectedBank
        ? selectedBank.loanTypes.flatMap((i) => (nav.loanTypes[i] ? [nav.loanTypes[i]] : []))
        : [],
    [nav, selectedBank],
  );
  // A bank with nothing attached yet is a real, valid state: say so rather
  // than present a silently empty list.
  const bankHasNoLoanTypes = Boolean(selectedBank) && loanTypes.length === 0;
  // Statuses are global: every live status applies to every attached pair.
  const statuses = useMemo(
    () => [...(nav?.statuses ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [nav],
  );
  const allSelected = Boolean(bankId && loanTypeId && statusId);

  const descriptionQuery = useQuery({
    queryKey: [
      "user",
      "description",
      submitted?.bankId,
      submitted?.loanTypeId,
      submitted?.statusId,
    ],
    queryFn: () =>
      submitted
        ? fetchDescription(submitted.bankId, submitted.loanTypeId, submitted.statusId)
        : Promise.reject(new Error("Nothing submitted yet.")),
    enabled: submitted !== null,
  });

  // Apply a triple from the URL: on arrival, from a recent-lookup link, or
  // on Back/Forward. Waits for the navigation data to check it still exists.
  useEffect(() => {
    if (!nav) return;
    const key = searchParams.toString();
    if (key === appliedParams.current) return;
    appliedParams.current = key;
    const triple = tripleFromParams(searchParams);
    if (triple === null) return;
    if (triple === "invalid" || !isAvailable(nav, triple)) {
      setLinkUnavailable(true);
      return;
    }
    setLinkUnavailable(false);
    setBankId(triple.bankId);
    setLoanTypeId(triple.loanTypeId);
    setStatusId(triple.statusId);
    setSubmitted(triple);
  }, [nav, searchParams]);

  // Remember each lookup that succeeded (an NA description included: it is
  // worth coming back to). Errors and 404s are not remembered.
  const { record } = recent;
  useEffect(() => {
    if (submitted && descriptionQuery.isSuccess) record(submitted);
  }, [submitted, descriptionQuery.isSuccess, descriptionQuery.dataUpdatedAt, record]);

  const stale =
    submitted !== null &&
    (submitted.bankId !== bankId ||
      submitted.loanTypeId !== loanTypeId ||
      submitted.statusId !== statusId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!allSelected) return;
    const triple = { bankId, loanTypeId, statusId };
    setSubmitted(triple);
    setLinkUnavailable(false);
    const params = new URL(workspaceHref(triple), window.location.origin).searchParams;
    appliedParams.current = params.toString();
    setSearchParams(params);
  }

  if (navQuery.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" label="Loading banks and loan types" />
      </div>
    );
  }

  if (navQuery.isError) {
    return (
      <ErrorState
        message={
          navQuery.error instanceof ApiError && navQuery.error.status === 503
            ? `We couldn't load the bank and loan type list: ${navQuery.error.message}`
            : "We couldn't load the bank and loan type list. Check your connection and try again."
        }
        action={
          <Button variant="secondary" onClick={() => void navQuery.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (banks.length === 0) {
    return (
      <EmptyState
        title="Nothing to look up yet"
        description="An admin hasn't added any banks yet. Check back soon."
      />
    );
  }

  // Everything the result card shows comes from the submitted triple.
  const shownBank = submitted ? banks.find((b) => b.id === submitted.bankId) : undefined;
  const shownLoanType = submitted
    ? nav?.loanTypes.find((lt) => lt.id === submitted.loanTypeId)
    : undefined;
  const shownStatusIndex = submitted
    ? statuses.findIndex((st) => st.id === submitted.statusId)
    : -1;
  const shownStatus = shownStatusIndex >= 0 ? statuses[shownStatusIndex] : undefined;

  // The combination on screen isn't repeated in the list beside it.
  const recentItems = (nav ? resolveRecentLookups(recent.entries, nav) : []).filter(
    (item) => !submitted || !sameTriple(item, submitted),
  );
  const counts = [
    plural(banks.length, "bank"),
    plural(nav?.loanTypes.length ?? 0, "loan type"),
    plural(statuses.length, "status", "statuses"),
  ].join(" · ");

  const raiseQueryContext: RaiseQueryContext | null =
    shownBank && shownLoanType && shownStatus
      ? {
          bankId: shownBank.id,
          bankName: shownBank.name,
          loanTypeId: shownLoanType.id,
          loanTypeName: shownLoanType.name,
          statusId: shownStatus.id,
          statusName: shownStatus.name,
        }
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-serif text-h1 text-ink">Workspace</h1>
        <p className="mt-1 text-body text-muted">
          Find a bank, loan type and status (type any part of a name), then show its description.
        </p>
        <p className="mt-1 text-small text-muted">{counts}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Combobox
            label="Bank"
            value={bankId}
            onChange={(value) => {
              setBankId(value);
              setLoanTypeId("");
              setStatusId("");
            }}
            placeholder="Type to search banks"
            options={banks.map((b) => ({ value: b.id, label: b.name }))}
          />
          <Combobox
            label="Loan type"
            value={loanTypeId}
            onChange={(value) => {
              setLoanTypeId(value);
              setStatusId("");
            }}
            placeholder={bankHasNoLoanTypes ? "None available" : "Type to search loan types"}
            disabled={!bankId || bankHasNoLoanTypes}
            {...(!bankId
              ? { hint: "Choose a bank first" }
              : bankHasNoLoanTypes
                ? { hint: "This bank has no loan types attached yet." }
                : {})}
            options={loanTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
          />
          <Combobox
            label="Status"
            value={statusId}
            onChange={setStatusId}
            placeholder="Type to search statuses"
            disabled={!loanTypeId}
            {...(!loanTypeId ? { hint: "Choose a loan type first" } : {})}
            // Names only: the field identifies a status. Its lifecycle
            // position belongs to the result, shown there as the sequence
            // dots and "Step n of N". The list stays in lifecycle order.
            options={statuses.map((st) => ({ value: st.id, label: st.name }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={!allSelected}>
            Show description
          </Button>
          <p className="text-small text-muted">
            {allSelected ? "Or press Enter." : "Choose all three to show the description."}
          </p>
        </div>
        {linkUnavailable && (
          <p role="status" className="text-small text-muted">
            That combination is no longer available. Choose again above.
          </p>
        )}
      </form>

      {submitted ? (
        <div className={RESULT_GRID}>
          <Card>
            {stale && (
              <p
                role="status"
                className="mb-3 rounded-sm bg-attention/12 px-3 py-2 text-small text-attention"
              >
                Selection changed: press Show description to update. Showing the previous result.
              </p>
            )}
            <div className="mb-4">
              {shownBank && shownLoanType && (
                <p className="text-small text-muted">
                  {shownBank.name} · {shownLoanType.name}
                </p>
              )}
              <h2 className="font-serif text-h2 text-ink">{shownStatus?.name ?? "Status"}</h2>
              {shownStatus && (
                <SequenceDots
                  className="mt-1.5"
                  value={shownStatusIndex + 1}
                  total={statuses.length}
                  label={`Step ${String(shownStatusIndex + 1)} of ${String(statuses.length)} in the loan lifecycle`}
                />
              )}
            </div>

            {descriptionQuery.isPending && (
              <div className="flex justify-center py-8">
                <Spinner label="Loading description" />
              </div>
            )}

            {descriptionQuery.isError && (
              <ErrorState
                message={
                  descriptionQuery.error instanceof ApiError &&
                  descriptionQuery.error.status === 404
                    ? descriptionQuery.error.message
                    : "We couldn't load this description. Try again."
                }
                action={
                  <Button variant="secondary" onClick={() => void descriptionQuery.refetch()}>
                    Retry
                  </Button>
                }
              />
            )}

            {descriptionQuery.data &&
              (descriptionQuery.data.body === NA_BODY ? (
                <div className="flex flex-col items-start gap-3 rounded-sm border border-dashed border-muted/30 px-4 py-5">
                  <p className="text-body text-muted">
                    No description has been added for this status yet.
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setModalOpen(true);
                    }}
                  >
                    Raise a query
                  </Button>
                  <QueryHelperLine />
                </div>
              ) : (
                <div className="flex flex-col items-start gap-4">
                  <p className="max-w-[66ch] whitespace-pre-wrap text-body-lg text-ink">
                    {descriptionQuery.data.body}
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setModalOpen(true);
                    }}
                  >
                    Raise a query
                  </Button>
                  <QueryHelperLine />
                </div>
              ))}
          </Card>
          <div className="flex flex-col gap-8">
            <RecentLookups items={recentItems} />
            <CreditProgress />
          </div>
        </div>
      ) : (
        // Before a lookup: where you left off, your progress, and your queries
        // worth looking at again. Each section is drawn only when it has
        // something; a brand-new user sees just their progress.
        <div className={RESULT_GRID}>
          <RecentLookups items={recentItems} />
          <div className="flex flex-col gap-8">
            <CreditProgress />
            <YourQueries nav={nav} />
          </div>
        </div>
      )}

      {raiseQueryContext && (
        <RaiseQueryModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
          }}
          context={raiseQueryContext}
        />
      )}
    </div>
  );
}

/**
 * Tells "raise a query" apart from a help request at the point of choice:
 * a query is about this one description, and can earn a credit point.
 */
function QueryHelperLine() {
  return (
    <p className="max-w-[66ch] text-small text-muted">
      Is this description wrong or missing something? Raise a query: if an admin approves it, you
      earn a credit point. For anything else,{" "}
      <Link to="/user/help" className="text-brand-ink underline">
        ask for help
      </Link>
      .
    </p>
  );
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** Main column and a rail, from `lg` up. */
const RESULT_GRID =
  "grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_20rem]";
