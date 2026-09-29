import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Combobox } from "../../components/Combobox";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Spinner } from "../../components/Spinner";
import { ApiError } from "../../lib/api";
import { fetchDescription, fetchWorkspaceNav } from "../../lib/userApi";
import { RaiseQueryModal, type RaiseQueryContext } from "./RaiseQueryModal";

const NA_BODY = "NA";

interface Triple {
  bankId: string;
  loanTypeId: string;
  statusId: string;
}

/**
 * Choose a bank, loan type and status with three typeahead comboboxes, then
 * ask for the description: "Show description" or Enter. Nothing loads before
 * that, so changing your mind costs nothing. The description query is keyed
 * to the *submitted* triple, not the live selection: change a selection
 * after a description is shown and it stays visible, marked stale, until you
 * ask again. It is never silently swapped for a different combination.
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

  const stale =
    submitted !== null &&
    (submitted.bankId !== bankId ||
      submitted.loanTypeId !== loanTypeId ||
      submitted.statusId !== statusId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!allSelected) return;
    setSubmitted({ bankId, loanTypeId, statusId });
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">Workspace</h1>
        <p className="mt-1 text-body text-muted">
          Find a bank, loan type and status (type any part of a name), then show its description.
        </p>
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
            options={statuses.map((st, i) => ({
              value: st.id,
              label: `${st.name} — step ${String(i + 1)} of ${String(statuses.length)}`,
            }))}
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
      </form>

      {submitted && (
        <Card>
          {stale && (
            <p
              role="status"
              className="mb-3 rounded-sm bg-attention/12 px-3 py-2 text-small text-attention"
            >
              Selection changed: press Show description to update. Showing the previous result.
            </p>
          )}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-serif text-h2 text-ink">{shownStatus?.name ?? "Status"}</h2>
              {shownBank && shownLoanType && (
                <p className="text-small text-muted">
                  {shownBank.name} · {shownLoanType.name}
                </p>
              )}
            </div>
            {shownStatus && (
              <Badge
                tone="neutral"
                label="Lifecycle position"
                position={{ index: shownStatusIndex + 1, total: statuses.length }}
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
                descriptionQuery.error instanceof ApiError && descriptionQuery.error.status === 404
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
