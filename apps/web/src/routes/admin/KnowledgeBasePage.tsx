import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DescriptionGridResponse, DescriptionGridRow } from "@way-to-credit/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EditableCell } from "../../components/EditableCell";
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
import { useToast } from "../../components/Toast";
import {
  fetchBanks,
  fetchLoanTypesForBank,
  fetchDescriptionGrid,
  upsertDescription,
} from "../../lib/adminApi";
import { formatIstDateTime } from "../../lib/format";
import { formatIstDateStamp } from "../../lib/ist";
import { CatalogDrawer } from "./CatalogDrawer";

const NA_BODY = "NA";

export function KnowledgeBasePage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [bankId, setBankId] = useState("");
  const [loanTypeId, setLoanTypeId] = useState("");
  const [showOnlyNA, setShowOnlyNA] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogInitialTab, setCatalogInitialTab] = useState<"banks" | "attachments">("banks");
  const [exporting, setExporting] = useState(false);
  const [unsavedIds, setUnsavedIds] = useState<Set<string>>(new Set());

  const banksQuery = useQuery({
    queryKey: ["admin", "banks", "active"],
    queryFn: () => fetchBanks(false),
  });
  const loanTypesQuery = useQuery({
    queryKey: ["admin", "loanTypesForBank", bankId],
    queryFn: () => fetchLoanTypesForBank(bankId),
    enabled: Boolean(bankId),
  });

  const allSelected = Boolean(bankId && loanTypeId);
  const gridQuery = useQuery({
    queryKey: ["admin", "descriptionGrid", bankId, loanTypeId],
    queryFn: () => fetchDescriptionGrid(bankId, loanTypeId),
    enabled: allSelected,
  });

  function handleBankChange(value: string) {
    setBankId(value);
    setLoanTypeId("");
  }

  // Never in-app-navigation-blocking (that would need React Router's
  // unstable_useBlocker, a deliberate scope line this app avoids) — only a
  // real page/tab unload is guarded, and only while at least one cell has a
  // genuine unsaved diff.
  useEffect(() => {
    if (unsavedIds.size === 0) return;
    function handler(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [unsavedIds.size]);

  const handleUnsavedChange = useCallback((statusId: string, hasUnsaved: boolean) => {
    setUnsavedIds((prev) => {
      const already = prev.has(statusId);
      if (already === hasUnsaved) return prev;
      const next = new Set(prev);
      if (hasUnsaved) next.add(statusId);
      else next.delete(statusId);
      return next;
    });
  }, []);

  const handleSaveDescription = useCallback(
    async (statusId: string, body: string) => {
      await upsertDescription({ bankId, loanTypeId, statusId, body });
      queryClient.setQueryData<DescriptionGridResponse>(
        ["admin", "descriptionGrid", bankId, loanTypeId],
        (old) =>
          old
            ? {
                ...old,
                rows: old.rows.map((r) =>
                  r.statusId === statusId ? { ...r, body, updatedAt: new Date().toISOString() } : r,
                ),
              }
            : old,
      );
      showToast("Description saved.", "success");
    },
    [bankId, loanTypeId, queryClient, showToast],
  );

  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const registerRef = useCallback((statusId: string, el: HTMLButtonElement | null) => {
    if (el) cellRefs.current.set(statusId, el);
    else cellRefs.current.delete(statusId);
  }, []);

  const allRows = useMemo(
    () => [...(gridQuery.data?.rows ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [gridQuery.data],
  );
  const naCount = allRows.filter((r) => r.body === NA_BODY).length;
  const visibleRows = showOnlyNA ? allRows.filter((r) => r.body === NA_BODY) : allRows;
  const order = useMemo(() => visibleRows.map((r) => r.statusId), [visibleRows]);
  const orderRef = useRef<string[]>([]);
  orderRef.current = order;

  const handleNavigate = useCallback((index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    const id = orderRef.current[nextIndex];
    if (id) cellRefs.current.get(id)?.focus();
  }, []);

  const handleSavedAdvance = useCallback((index: number) => {
    const id = orderRef.current[index + 1];
    if (id) cellRefs.current.get(id)?.focus();
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-base-export-${formatIstDateStamp(new Date())}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Export downloaded.", "success");
    } catch {
      showToast("Couldn't export the knowledge base. Try again.", "error");
    } finally {
      setExporting(false);
    }
  }

  const banks = banksQuery.data ?? [];
  const loanTypes = loanTypesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-h1 text-ink">Knowledge base</h1>
          <p className="mt-1 text-body text-slate">
            Choose a bank and loan type to view and edit its status descriptions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setCatalogInitialTab("banks");
              setCatalogOpen(true);
            }}
          >
            Manage catalog
          </Button>
          <Button variant="secondary" loading={exporting} onClick={() => void handleExport()}>
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            setLoanTypeId(e.target.value);
          }}
          placeholder="Choose a loan type"
          disabled={!bankId}
          {...(!bankId ? { hint: "Choose a bank first" } : {})}
          options={loanTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
        />
      </div>

      {allSelected && gridQuery.isPending && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" label="Loading descriptions" />
        </div>
      )}

      {allSelected && gridQuery.isError && (
        <ErrorState
          message="We couldn't load this grid. Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => void gridQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {allSelected && gridQuery.data && (
        <div className="flex flex-col gap-4">
          {!gridQuery.data.wired && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-alert/10 px-4 py-3 text-body text-alert">
              <span>
                This loan type isn&apos;t attached to this bank yet — editing is disabled.
              </span>
              <Button
                variant="secondary"
                onClick={() => {
                  setCatalogInitialTab("attachments");
                  setCatalogOpen(true);
                }}
              >
                Attach it
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body text-slate">
              {naCount} of {allRows.length} status{allRows.length === 1 ? "" : "es"} still marked NA
            </p>
            <label className="flex items-center gap-2 text-body text-ink">
              <input
                type="checkbox"
                checked={showOnlyNA}
                onChange={(e) => {
                  setShowOnlyNA(e.target.checked);
                }}
              />
              Show only NA
            </label>
          </div>

          {visibleRows.length === 0 ? (
            <EmptyState
              title={showOnlyNA ? "Nothing marked NA" : "No statuses yet"}
              description={
                showOnlyNA
                  ? "Every status for this pair already has a description."
                  : "An admin hasn't added any statuses yet."
              }
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="w-56">Status</TableHeaderCell>
                  <TableHeaderCell>Description</TableHeaderCell>
                  <TableHeaderCell className="w-44">Last updated</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleRows.map((row, index) => (
                  <KnowledgeBaseRow
                    key={row.statusId}
                    row={row}
                    index={index}
                    total={visibleRows.length}
                    disabled={!gridQuery.data.wired}
                    onSave={handleSaveDescription}
                    onNavigate={handleNavigate}
                    onSavedAdvance={handleSavedAdvance}
                    onUnsavedChange={handleUnsavedChange}
                    registerRef={registerRef}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <CatalogDrawer
        isOpen={catalogOpen}
        initialTab={catalogInitialTab}
        onClose={() => {
          setCatalogOpen(false);
        }}
      />
    </div>
  );
}

interface KnowledgeBaseRowProps {
  row: DescriptionGridRow;
  index: number;
  total: number;
  disabled: boolean;
  onSave: (statusId: string, body: string) => Promise<void>;
  onNavigate: (index: number, direction: "up" | "down") => void;
  onSavedAdvance: (index: number) => void;
  onUnsavedChange: (statusId: string, hasUnsaved: boolean) => void;
  registerRef: (statusId: string, el: HTMLButtonElement | null) => void;
}

function KnowledgeBaseRow({
  row,
  index,
  total,
  disabled,
  onSave,
  onNavigate,
  onSavedAdvance,
  onUnsavedChange,
  registerRef,
}: KnowledgeBaseRowProps) {
  const handleSave = useCallback(
    (body: string) => onSave(row.statusId, body),
    [onSave, row.statusId],
  );
  const handleNavigate = useCallback(
    (direction: "up" | "down") => {
      onNavigate(index, direction);
    },
    [onNavigate, index],
  );
  const handleSavedAdvance = useCallback(() => {
    onSavedAdvance(index);
  }, [onSavedAdvance, index]);
  const handleUnsavedChange = useCallback(
    (hasUnsaved: boolean) => {
      onUnsavedChange(row.statusId, hasUnsaved);
    },
    [onUnsavedChange, row.statusId],
  );
  const setRef = useCallback(
    (el: HTMLButtonElement | null) => {
      registerRef(row.statusId, el);
    },
    [registerRef, row.statusId],
  );

  return (
    <TableRow>
      <TableCell className="align-top">
        <div className="flex flex-col gap-1">
          <span className="text-body font-medium text-ink">{row.statusName}</span>
          <Badge tone="neutral" label="Lifecycle position" position={{ index: index + 1, total }} />
        </div>
      </TableCell>
      <TableCell className="align-top">
        <EditableCell
          ref={setRef}
          value={row.body}
          disabled={disabled}
          {...(disabled ? { disabledHint: "Attach this loan type to the bank first." } : {})}
          onSave={handleSave}
          onNavigate={handleNavigate}
          onSavedAdvance={handleSavedAdvance}
          onUnsavedChange={handleUnsavedChange}
        />
      </TableCell>
      <TableCell className="align-top text-small text-slate">
        {row.updatedAt ? formatIstDateTime(row.updatedAt) : "—"}
      </TableCell>
    </TableRow>
  );
}
