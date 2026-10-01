import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminQueryRow,
  DescriptionGridResponse,
  DescriptionGridRow,
} from "@way-to-credit/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  fetchAdminQueries,
  fetchBanks,
  fetchLoanTypesForBank,
  fetchDescriptionGrid,
  upsertDescription,
} from "../../lib/adminApi";
import { formatIstDateTime, formatRelativeTime } from "../../lib/format";
import { formatIstDateStamp } from "../../lib/ist";
import { useAuth } from "../../lib/auth";
import { CatalogDrawer } from "./CatalogDrawer";
import { CoverageList } from "./CoverageList";

const NA_BODY = "NA";
const PENDING_PAGE = 50;

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
  // Pending queries, so each status shows what users have said about it next
  // to the text being fixed. One page of 50 (the oldest first), filtered to
  // this pair here. There's no server filter by pair, so with more pending
  // than that, the counts say "at least".
  const pendingQuery = useQuery({
    queryKey: ["admin", "queries", "pending-for-kb"],
    queryFn: () => fetchAdminQueries({ status: "pending", sort: "asc", limit: PENDING_PAGE }),
    enabled: allSelected,
  });
  const gridQuery = useQuery({
    queryKey: ["admin", "descriptionGrid", bankId, loanTypeId],
    queryFn: () => fetchDescriptionGrid(bankId, loanTypeId),
    enabled: allSelected,
  });

  // The pair this admin last opened, remembered in this browser (ids only;
  // names come from the bank list and that bank's loan types).
  const { identity } = useAuth();
  const lastPairKey = identity ? `wtc.kb.lastPair.v1.${identity.id}` : null;
  const [storedPair] = useState(() => (lastPairKey ? readLastPair(lastPairKey) : null));
  useEffect(() => {
    if (lastPairKey && bankId && loanTypeId) writeLastPair(lastPairKey, { bankId, loanTypeId });
  }, [lastPairKey, bankId, loanTypeId]);
  const lastPairLoanTypes = useQuery({
    queryKey: ["admin", "loanTypesForBank", storedPair?.bankId ?? ""],
    queryFn: () => fetchLoanTypesForBank(storedPair?.bankId ?? ""),
    enabled: Boolean(storedPair),
  });
  const lastPairBank = banksQuery.data?.find((b) => b.id === storedPair?.bankId);
  const lastPairLoanType = lastPairLoanTypes.data?.find((lt) => lt.id === storedPair?.loanTypeId);
  const lastPair =
    storedPair && lastPairBank && lastPairLoanType
      ? { ...storedPair, label: `${lastPairBank.name} · ${lastPairLoanType.name}` }
      : null;
  const selectedBankName = banksQuery.data?.find((b) => b.id === bankId)?.name;

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
      void queryClient.invalidateQueries({ queryKey: ["admin", "descriptionCoverage"] });
      showToast("Description saved.", "success");
    },
    [bankId, loanTypeId, queryClient, showToast],
  );

  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const registerRef = useCallback((statusId: string, el: HTMLButtonElement | null) => {
    if (el) cellRefs.current.set(statusId, el);
    else cellRefs.current.delete(statusId);
  }, []);

  const pendingByStatus = useMemo(() => {
    const map = new Map<string, AdminQueryRow[]>();
    for (const q of pendingQuery.data?.items ?? []) {
      if (q.bankId !== bankId || q.loanTypeId !== loanTypeId) continue;
      map.set(q.statusId, [...(map.get(q.statusId) ?? []), q]);
    }
    return map;
  }, [pendingQuery.data, bankId, loanTypeId]);
  const pendingCapped = pendingQuery.data?.nextCursor != null;

  const allRows = useMemo(
    () => [...(gridQuery.data?.rows ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [gridQuery.data],
  );
  const naCount = allRows.filter((r) => r.body === NA_BODY).length;
  // Lifecycle position comes from the full ordered list, not the visible one:
  // with "Show only NA" on, the row index is its place among the NA rows.
  const stepOf = useMemo(() => new Map(allRows.map((r, i) => [r.statusId, i + 1])), [allRows]);
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
      {/* The text block shrinks so the action stays beside it: with the
          wider UI font, a fixed block pushed the button onto its own line. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-h1 text-ink">Knowledge base</h1>
          <p className="mt-1 text-body text-muted">
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

      {/* Before a pair is open: where to start. The last pair this admin worked
          on, then the pairs with the most missing descriptions (or, with a bank
          chosen, its loan types), each one click from opening. */}
      {!allSelected && (
        <div className="flex flex-col gap-6">
          {lastPair && (
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  setBankId(lastPair.bankId);
                  setLoanTypeId(lastPair.loanTypeId);
                }}
              >
                Reopen {lastPair.label}
              </Button>
            </div>
          )}
          <CoverageList
            {...(bankId ? { bankId } : {})}
            {...(selectedBankName ? { bankName: selectedBankName } : {})}
            onPick={(pickedBank, pickedLoanType) => {
              setBankId(pickedBank);
              setLoanTypeId(pickedLoanType);
            }}
          />
        </div>
      )}

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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-negative/10 px-4 py-3 text-body text-negative">
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
            <p className="text-body text-muted">
              {allRows.length} status{allRows.length === 1 ? "" : "es"} ·{" "}
              {naCount === 0
                ? "all have a description"
                : `${String(naCount)} still need${naCount === 1 ? "s" : ""} a description`}
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
                  <TableHeaderCell className="w-60">Status</TableHeaderCell>
                  <TableHeaderCell>Description</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleRows.map((row, index) => (
                  <KnowledgeBaseRow
                    key={row.statusId}
                    row={row}
                    index={index}
                    step={stepOf.get(row.statusId) ?? index + 1}
                    lifecycleTotal={allRows.length}
                    pending={pendingByStatus.get(row.statusId) ?? []}
                    pendingCapped={pendingCapped}
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
  /** Position in the visible list, for keyboard navigation between rows. */
  index: number;
  /** Position in the lifecycle (1-based), whatever the filter. */
  step: number;
  lifecycleTotal: number;
  pending: AdminQueryRow[];
  pendingCapped: boolean;
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
  step,
  lifecycleTotal,
  pending,
  pendingCapped,
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

  const [showPending, setShowPending] = useState(false);
  const pendingLabel = `${pendingCapped ? "At least " : ""}${String(pending.length)} pending ${
    pending.length === 1 ? "query" : "queries"
  }`;

  return (
    <TableRow>
      <TableCell className="align-top">
        {/* Plain text, not a pill: in this narrow column the "Lifecycle
            position (n of 50)" pill wrapped onto two lines once the UI font
            set ~5% wider. "Last updated" lives here now too, giving its
            column to the description. */}
        <div className="flex flex-col gap-0.5">
          <span className="text-body font-medium text-ink">{row.statusName}</span>
          <span className="text-small text-muted">
            Step {step} of {lifecycleTotal}
            {row.updatedAt && (
              <span title={`${formatIstDateTime(row.updatedAt)} IST`}>
                {" "}
                · updated {formatRelativeTime(row.updatedAt)}
              </span>
            )}
          </span>
          {pending.length > 0 && (
            <button
              type="button"
              aria-expanded={showPending}
              onClick={() => {
                setShowPending((v) => !v);
              }}
              className="self-start text-small font-medium text-attention underline"
            >
              {pendingLabel}
            </button>
          )}
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
        {showPending && (
          <ul className="mt-2 flex flex-col gap-1.5 rounded-sm bg-attention/10 px-3 py-2">
            {pending.map((q) => (
              <li key={q.id} className="text-small text-ink">
                &ldquo;{q.message}&rdquo;
                <span className="text-muted"> · raised {formatRelativeTime(q.raisedAt)}</span>
              </li>
            ))}
            <li className="text-small">
              <Link to="/admin/queries" className="text-brand-ink underline">
                Approve or reject in the Query inbox
              </Link>
            </li>
          </ul>
        )}
      </TableCell>
    </TableRow>
  );
}

interface StoredPair {
  bankId: string;
  loanTypeId: string;
}

function readLastPair(key: string): StoredPair | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredPair>;
    return typeof v.bankId === "string" && typeof v.loanTypeId === "string"
      ? { bankId: v.bankId, loanTypeId: v.loanTypeId }
      : null;
  } catch {
    return null;
  }
}

function writeLastPair(key: string, pair: StoredPair): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(pair));
  } catch {
    // Storage blocked or full: it just isn't remembered.
  }
}
