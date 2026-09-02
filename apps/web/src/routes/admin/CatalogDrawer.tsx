import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Status } from "@way-to-credit/shared";
import { useState } from "react";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ErrorState } from "../../components/ErrorState";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import {
  attachLoanType,
  createBank,
  createLoanType,
  createStatus,
  deleteBank,
  deleteLoanType,
  deleteStatus,
  detachLoanType,
  fetchBanks,
  fetchLoanTypes,
  fetchLoanTypesForBank,
  fetchStatuses,
  renameBank,
  renameLoanType,
  undeleteBank,
  undeleteLoanType,
  undeleteStatus,
  updateStatus,
} from "../../lib/adminApi";

export interface CatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** @default "banks" — the knowledge base's "attach this loan type" banner deep-links straight to the attach tab. */
  initialTab?: Tab;
}

type Tab = "banks" | "loanTypes" | "statuses" | "attachments";

const TABS: { id: Tab; label: string }[] = [
  { id: "banks", label: "Banks" },
  { id: "loanTypes", label: "Loan types" },
  { id: "statuses", label: "Statuses" },
  { id: "attachments", label: "Attach loan types" },
];

/**
 * Three catalog sections (banks, loan types, statuses) each a create form +
 * list with rename/soft-delete/undelete, plus a fourth tab for wiring a
 * bank to its loan types (gap 2's endpoint). Every soft-delete confirms
 * through `ConfirmDialog`; a `HAS_DEPENDENT_DESCRIPTIONS` failure shows the
 * server's own message verbatim instead of a generic failure.
 */
export function CatalogDrawer({ isOpen, onClose, initialTab = "banks" }: CatalogDrawerProps) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage catalog" size="lg">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-1 border-b border-slate/15 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
              }}
              className={`rounded-sm px-3 py-1.5 text-body font-medium ${
                tab === t.id ? "bg-maroon text-paper" : "text-ink hover:bg-ink/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "banks" && (
          <NamedEntitySection
            noun="bank"
            queryKeyBase="banks"
            fetchAll={() => fetchBanks(true)}
            create={createBank}
            rename={renameBank}
            softDelete={deleteBank}
            undelete={undeleteBank}
          />
        )}
        {tab === "loanTypes" && (
          <NamedEntitySection
            noun="loan type"
            queryKeyBase="loanTypes"
            fetchAll={() => fetchLoanTypes(true)}
            create={createLoanType}
            rename={renameLoanType}
            softDelete={deleteLoanType}
            undelete={undeleteLoanType}
          />
        )}
        {tab === "statuses" && <StatusSection />}
        {tab === "attachments" && <AttachmentSection />}
      </div>
    </Modal>
  );
}

interface NamedEntity {
  id: string;
  name: string;
  deletedAt: string | null;
}

/** Shared shape for banks and loan types — identical create/rename/soft-delete/undelete flow, only the noun and endpoints differ. */
function NamedEntitySection({
  noun,
  queryKeyBase,
  fetchAll,
  create,
  rename,
  softDelete,
  undelete,
}: {
  noun: string;
  queryKeyBase: string;
  fetchAll: () => Promise<NamedEntity[]>;
  create: (name: string) => Promise<NamedEntity>;
  rename: (id: string, name: string) => Promise<NamedEntity>;
  softDelete: (id: string) => Promise<NamedEntity>;
  undelete: (id: string) => Promise<NamedEntity>;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const listQuery = useQuery({ queryKey: ["admin", queryKeyBase, "all"], queryFn: fetchAll });

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["admin", queryKeyBase] });
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      await create(trimmed);
      await invalidate();
      setNewName("");
      showToast(`${capitalize(noun)} created.`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `Couldn't create ${noun}.`, "error");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(item: NamedEntity) {
    setEditingId(item.id);
    setEditName(item.name);
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setSavingId(id);
    try {
      await rename(id, trimmed);
      await invalidate();
      setEditingId(null);
      showToast(`${capitalize(noun)} renamed.`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `Couldn't rename ${noun}.`, "error");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await softDelete(id);
      await invalidate();
      showToast(`${capitalize(noun)} deleted.`, "success");
      setConfirmDeleteId(null);
      setDeleteError(null);
    } catch (err) {
      // Surfaced verbatim — HAS_DEPENDENT_DESCRIPTIONS already carries the
      // exact live-row count in its message server-side.
      setDeleteError(err instanceof ApiError ? err.message : `Couldn't delete this ${noun}.`);
    }
  }

  async function handleUndelete(id: string) {
    try {
      await undelete(id);
      await invalidate();
      showToast(`${capitalize(noun)} restored.`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `Couldn't restore this ${noun}.`, "error");
    }
  }

  if (listQuery.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner label={`Loading ${noun}s`} />
      </div>
    );
  }
  if (listQuery.isError) {
    return (
      <ErrorState
        message={`Couldn't load ${noun}s.`}
        action={
          <Button variant="secondary" onClick={() => void listQuery.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const items = listQuery.data;
  const active = items.filter((i) => !i.deletedAt);
  const deleted = items.filter((i) => i.deletedAt);

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(e) => void handleCreate(e)} className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label={`New ${noun}`}
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
            disabled={creating}
          />
        </div>
        <Button type="submit" loading={creating} disabled={!newName.trim()}>
          Add
        </Button>
      </form>

      <ul className="flex flex-col divide-y divide-slate/10 rounded-md border border-slate/20">
        {active.length === 0 && (
          <li className="px-3 py-4 text-small text-slate">No active {noun}s yet.</li>
        )}
        {active.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
            {editingId === item.id ? (
              <div className="flex flex-1 items-center gap-2">
                {/* Opening rename is itself the user's request to edit — autofocus is the point. */}
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                  }}
                  className="flex-1 rounded-sm border border-slate/40 px-2 py-1 text-body text-ink"
                />
                <Button
                  variant="primary"
                  loading={savingId === item.id}
                  onClick={() => void saveEdit(item.id)}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <span className="text-body text-ink">{item.name}</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      startEdit(item);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-alert"
                    onClick={() => {
                      setConfirmDeleteId(item.id);
                      setDeleteError(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {deleted.length > 0 && (
        <details>
          <summary className="cursor-pointer text-small font-medium text-slate">
            {deleted.length} deleted {noun}
            {deleted.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-slate/10 rounded-md border border-slate/15 bg-paper">
            {deleted.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-body text-slate line-through">{item.name}</span>
                <Button variant="ghost" onClick={() => void handleUndelete(item.id)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        onClose={() => {
          setConfirmDeleteId(null);
          setDeleteError(null);
        }}
        title={`Delete ${noun}`}
        description={
          deleteError ??
          `This soft-deletes the ${noun}. It can be restored later unless something still depends on it.`
        }
        confirmLabel={deleteError ? "OK" : "Delete"}
        onConfirm={async () => {
          if (deleteError) {
            setConfirmDeleteId(null);
            setDeleteError(null);
            return;
          }
          if (confirmDeleteId) await handleDelete(confirmDeleteId);
        }}
      />
    </div>
  );
}

/** Statuses carry a `sortOrder` alongside `name`, so they get their own section rather than fitting `NamedEntitySection`'s shape. */
function StatusSection() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const listQuery = useQuery({
    queryKey: ["admin", "statuses", "all"],
    queryFn: () => fetchStatuses(true),
  });

  const [newName, setNewName] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["admin", "statuses"] });
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    const sortOrder = Number(newSortOrder);
    if (!trimmed || !Number.isInteger(sortOrder) || creating) return;
    setCreating(true);
    try {
      await createStatus(trimmed, sortOrder);
      await invalidate();
      setNewName("");
      setNewSortOrder("");
      showToast("Status created.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't create status.", "error");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(item: Status) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditSortOrder(String(item.sortOrder));
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim();
    const sortOrder = Number(editSortOrder);
    if (!trimmed || !Number.isInteger(sortOrder)) return;
    setSavingId(id);
    try {
      await updateStatus(id, { name: trimmed, sortOrder });
      await invalidate();
      setEditingId(null);
      showToast("Status updated.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't update status.", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteStatus(id);
      await invalidate();
      showToast("Status deleted.", "success");
      setConfirmDeleteId(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Couldn't delete this status.");
    }
  }

  async function handleUndelete(id: string) {
    try {
      await undeleteStatus(id);
      await invalidate();
      showToast("Status restored.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't restore this status.", "error");
    }
  }

  if (listQuery.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner label="Loading statuses" />
      </div>
    );
  }
  if (listQuery.isError) {
    return (
      <ErrorState
        message="Couldn't load statuses."
        action={
          <Button variant="secondary" onClick={() => void listQuery.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const items = [...listQuery.data].sort((a, b) => a.sortOrder - b.sortOrder);
  const active = items.filter((i) => !i.deletedAt);
  const deleted = items.filter((i) => i.deletedAt);

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(e) => void handleCreate(e)} className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="New status"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
            placeholder="e.g. Sanctioned"
            disabled={creating}
          />
        </div>
        <div className="w-28">
          <Input
            label="Sort order"
            type="number"
            value={newSortOrder}
            onChange={(e) => {
              setNewSortOrder(e.target.value);
            }}
            disabled={creating}
          />
        </div>
        <Button
          type="submit"
          loading={creating}
          disabled={!newName.trim() || newSortOrder.trim() === ""}
        >
          Add
        </Button>
      </form>

      <ul className="flex flex-col divide-y divide-slate/10 rounded-md border border-slate/20">
        {active.length === 0 && (
          <li className="px-3 py-4 text-small text-slate">No active statuses yet.</li>
        )}
        {active.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
            {editingId === item.id ? (
              <div className="flex flex-1 items-center gap-2">
                {/* Opening edit is itself the user's request — autofocus is the point. */}
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                  }}
                  className="flex-1 rounded-sm border border-slate/40 px-2 py-1 text-body text-ink"
                />
                <input
                  value={editSortOrder}
                  type="number"
                  onChange={(e) => {
                    setEditSortOrder(e.target.value);
                  }}
                  className="w-20 rounded-sm border border-slate/40 px-2 py-1 text-body text-ink"
                />
                <Button
                  variant="primary"
                  loading={savingId === item.id}
                  onClick={() => void saveEdit(item.id)}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <span className="text-body text-ink">
                  {item.name}{" "}
                  <span className="text-small text-slate">(order {item.sortOrder})</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      startEdit(item);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-alert"
                    onClick={() => {
                      setConfirmDeleteId(item.id);
                      setDeleteError(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {deleted.length > 0 && (
        <details>
          <summary className="cursor-pointer text-small font-medium text-slate">
            {deleted.length} deleted status{deleted.length === 1 ? "" : "es"}
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-slate/10 rounded-md border border-slate/15 bg-paper">
            {deleted.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-body text-slate line-through">{item.name}</span>
                <Button variant="ghost" onClick={() => void handleUndelete(item.id)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        onClose={() => {
          setConfirmDeleteId(null);
          setDeleteError(null);
        }}
        title="Delete status"
        description={
          deleteError ??
          "This soft-deletes the status. It can be restored later unless something still depends on it."
        }
        confirmLabel={deleteError ? "OK" : "Delete"}
        onConfirm={async () => {
          if (deleteError) {
            setConfirmDeleteId(null);
            setDeleteError(null);
            return;
          }
          if (confirmDeleteId) await handleDelete(confirmDeleteId);
        }}
      />
    </div>
  );
}

/** Which active loan types are attached to which bank — gap 2's endpoint drives the checked state; attach/detach are the two existing bankLoanTypes routes. */
function AttachmentSection() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [bankId, setBankId] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const banksQuery = useQuery({
    queryKey: ["admin", "banks", "active"],
    queryFn: () => fetchBanks(false),
  });
  const loanTypesQuery = useQuery({
    queryKey: ["admin", "loanTypes", "active"],
    queryFn: () => fetchLoanTypes(false),
  });
  const attachedQuery = useQuery({
    queryKey: ["admin", "loanTypesForBank", bankId],
    queryFn: () => fetchLoanTypesForBank(bankId),
    enabled: Boolean(bankId),
  });

  const attachedIds = new Set((attachedQuery.data ?? []).map((lt) => lt.id));

  async function toggle(loanTypeId: string, attached: boolean) {
    setPendingId(loanTypeId);
    try {
      if (attached) {
        await detachLoanType(bankId, loanTypeId);
        showToast("Loan type detached.", "success");
      } else {
        await attachLoanType(bankId, loanTypeId);
        showToast("Loan type attached.", "success");
      }
      await queryClient.invalidateQueries({ queryKey: ["admin", "loanTypesForBank", bankId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "descriptionGrid"] });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't update attachment.", "error");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Select
        label="Bank"
        value={bankId}
        onChange={(e) => {
          setBankId(e.target.value);
        }}
        placeholder="Choose a bank"
        options={(banksQuery.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
      />

      {!bankId && (
        <p className="text-small text-slate">Choose a bank to manage its attached loan types.</p>
      )}

      {bankId && (loanTypesQuery.isPending || attachedQuery.isPending) && (
        <div className="flex justify-center py-8">
          <Spinner label="Loading loan types" />
        </div>
      )}

      {bankId && loanTypesQuery.data && attachedQuery.data && (
        <ul className="flex flex-col divide-y divide-slate/10 rounded-md border border-slate/20">
          {loanTypesQuery.data.length === 0 && (
            <li className="px-3 py-4 text-small text-slate">No active loan types yet.</li>
          )}
          {loanTypesQuery.data.map((lt) => {
            const attached = attachedIds.has(lt.id);
            return (
              <li key={lt.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span className="text-body text-ink">{lt.name}</span>
                <Button
                  variant={attached ? "secondary" : "primary"}
                  loading={pendingId === lt.id}
                  onClick={() => void toggle(lt.id, attached)}
                >
                  {attached ? "Detach" : "Attach"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
