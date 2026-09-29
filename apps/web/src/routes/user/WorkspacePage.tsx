import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import { fetchDescription, fetchWorkspaceNav } from "../../lib/userApi";
import { RaiseQueryModal, type RaiseQueryContext } from "./RaiseQueryModal";

const NA_BODY = "NA";

export function WorkspacePage() {
  // No retry: a failed or timed-out navigation load says so at once, rather
  // than retrying behind a spinner (a 5 s timeout retried once kept users
  // waiting 12 s to learn something was wrong). The Retry button is right there.
  const treeQuery = useQuery({
    queryKey: ["user", "navigation"],
    queryFn: fetchWorkspaceNav,
    retry: false,
  });

  const [bankId, setBankId] = useState("");
  const [loanTypeId, setLoanTypeId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const nav = treeQuery.data;
  const banks = nav?.banks ?? [];
  const selectedBank = banks.find((b) => b.id === bankId);
  const loanTypes = useMemo(
    () =>
      nav && selectedBank
        ? selectedBank.loanTypes.flatMap((i) => (nav.loanTypes[i] ? [nav.loanTypes[i]] : []))
        : [],
    [nav, selectedBank],
  );
  // A bank with nothing wired to it yet is a real, valid state — say so,
  // rather than presenting a silently empty dropdown.
  const bankHasNoLoanTypes = Boolean(selectedBank) && loanTypes.length === 0;
  const selectedLoanType = loanTypes.find((lt) => lt.id === loanTypeId);
  // Statuses are global: every live status applies to every attached pair.
  const statuses = useMemo(
    () =>
      selectedLoanType ? [...(nav?.statuses ?? [])].sort((a, b) => a.sortOrder - b.sortOrder) : [],
    [nav, selectedLoanType],
  );
  const selectedStatus = statuses.find((s) => s.id === statusId);

  const allSelected = Boolean(bankId && loanTypeId && statusId);
  const descriptionQuery = useQuery({
    queryKey: ["user", "description", bankId, loanTypeId, statusId],
    queryFn: () => fetchDescription(bankId, loanTypeId, statusId),
    enabled: allSelected,
  });

  function handleBankChange(value: string) {
    setBankId(value);
    setLoanTypeId("");
    setStatusId("");
  }

  function handleLoanTypeChange(value: string) {
    setLoanTypeId(value);
    setStatusId("");
  }

  if (treeQuery.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" label="Loading banks and loan types" />
      </div>
    );
  }

  if (treeQuery.isError) {
    return (
      <ErrorState
        message="We couldn't load the bank and loan type list. Check your connection and try again."
        action={
          <Button variant="secondary" onClick={() => void treeQuery.refetch()}>
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

  const raiseQueryContext: RaiseQueryContext | null =
    selectedBank && selectedLoanType && selectedStatus
      ? {
          bankId: selectedBank.id,
          bankName: selectedBank.name,
          loanTypeId: selectedLoanType.id,
          loanTypeName: selectedLoanType.name,
          statusId: selectedStatus.id,
          statusName: selectedStatus.name,
        }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">Workspace</h1>
        <p className="mt-1 text-body text-muted">
          Choose a bank, loan type, and status to see its description.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Select
          label="Bank"
          value={bankId}
          onChange={(e) => {
            handleBankChange(e.target.value);
          }}
          placeholder="Choose a bank"
          options={banks.map((b) => ({ value: b.id, label: b.name }))}
        />
        <Select
          label="Loan type"
          value={loanTypeId}
          onChange={(e) => {
            handleLoanTypeChange(e.target.value);
          }}
          placeholder={bankHasNoLoanTypes ? "None available" : "Choose a loan type"}
          disabled={!bankId || bankHasNoLoanTypes}
          {...(!bankId
            ? { hint: "Choose a bank first" }
            : bankHasNoLoanTypes
              ? { hint: "This bank has no loan types attached yet." }
              : {})}
          options={loanTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
        />
        <Select
          label="Status"
          value={statusId}
          onChange={(e) => {
            setStatusId(e.target.value);
          }}
          placeholder="Choose a status"
          disabled={!loanTypeId}
          {...(!loanTypeId ? { hint: "Choose a loan type first" } : {})}
          options={statuses.map((s, i) => ({
            value: s.id,
            label: `${s.name} — step ${String(i + 1)} of ${String(statuses.length)}`,
          }))}
        />
      </div>

      {allSelected && selectedStatus && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-h2 text-ink">{selectedStatus.name}</h2>
            <Badge
              tone="neutral"
              label="Lifecycle position"
              position={{ index: statuses.indexOf(selectedStatus) + 1, total: statuses.length }}
            />
          </div>

          {descriptionQuery.isPending && (
            <div className="flex justify-center py-8">
              <Spinner label="Loading description" />
            </div>
          )}

          {descriptionQuery.isError && (
            <ErrorState
              message="We couldn't load this description. Try again."
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
