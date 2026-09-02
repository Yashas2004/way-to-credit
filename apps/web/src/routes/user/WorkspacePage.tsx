import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import { fetchDescription, fetchUserTree } from "../../lib/userApi";
import { RaiseQueryModal, type RaiseQueryContext } from "./RaiseQueryModal";

const NA_BODY = "NA";

export function WorkspacePage() {
  const treeQuery = useQuery({ queryKey: ["user", "tree"], queryFn: fetchUserTree });

  const [bankId, setBankId] = useState("");
  const [loanTypeId, setLoanTypeId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const banks = treeQuery.data ?? [];
  const selectedBank = banks.find((b) => b.bankId === bankId);
  const loanTypes = selectedBank?.loanTypes ?? [];
  const selectedLoanType = loanTypes.find((lt) => lt.loanTypeId === loanTypeId);
  const statuses = useMemo(
    () => [...(selectedLoanType?.statuses ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [selectedLoanType],
  );
  const selectedStatus = statuses.find((s) => s.statusId === statusId);

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
          bankId: selectedBank.bankId,
          bankName: selectedBank.bankName,
          loanTypeId: selectedLoanType.loanTypeId,
          loanTypeName: selectedLoanType.loanTypeName,
          statusId: selectedStatus.statusId,
          statusName: selectedStatus.statusName,
        }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-h1 text-ink">Workspace</h1>
        <p className="mt-1 text-body text-slate">
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
          options={banks.map((b) => ({ value: b.bankId, label: b.bankName }))}
        />
        <Select
          label="Loan type"
          value={loanTypeId}
          onChange={(e) => {
            handleLoanTypeChange(e.target.value);
          }}
          placeholder="Choose a loan type"
          disabled={!bankId}
          {...(!bankId ? { hint: "Choose a bank first" } : {})}
          options={loanTypes.map((lt) => ({ value: lt.loanTypeId, label: lt.loanTypeName }))}
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
            value: s.statusId,
            label: `${s.statusName} — step ${String(i + 1)} of ${String(statuses.length)}`,
          }))}
        />
      </div>

      {allSelected && selectedStatus && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-h2 text-ink">{selectedStatus.statusName}</h2>
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
              <div className="flex flex-col items-start gap-3 rounded-sm border border-dashed border-slate/30 px-4 py-5">
                <p className="text-body text-slate">
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
              </div>
            ) : (
              <div className="flex flex-col items-start gap-4">
                <p className="whitespace-pre-wrap text-body-lg text-ink">
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
