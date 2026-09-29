import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MilestoneResponse } from "@way-to-credit/shared";
import { useState } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
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
import { ApiError } from "../../lib/api";
import { deactivateMilestone, fetchMilestones, reactivateMilestone } from "../../lib/adminApi";
import { MilestoneFormModal } from "./MilestoneFormModal";

export function MilestonesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const milestonesQuery = useQuery({ queryKey: ["admin", "milestones"], queryFn: fetchMilestones });

  const [formOpen, setFormOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<MilestoneResponse | undefined>(
    undefined,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<MilestoneResponse | null>(null);
  // Deactivated milestones are hidden by default. There is deliberately no
  // separate "archived" state: deactivation already stops unlocks, removes
  // the milestone from every user's rewards map, and leaves existing unlocks
  // untouched, so hiding it here is the only thing archiving would add.
  const [show, setShow] = useState<"active" | "inactive" | "all">("active");

  function openCreate() {
    setEditingMilestone(undefined);
    setFormOpen(true);
  }

  function openEdit(milestone: MilestoneResponse) {
    setEditingMilestone(milestone);
    setFormOpen(true);
  }

  async function handleToggleActive(milestone: MilestoneResponse) {
    setPendingId(milestone.id);
    try {
      if (milestone.isActive) {
        await deactivateMilestone(milestone.id);
      } else {
        await reactivateMilestone(milestone.id);
      }
      await queryClient.invalidateQueries({ queryKey: ["admin", "milestones"] });
      showToast(
        milestone.isActive ? "Milestone deactivated." : "Milestone reactivated.",
        "success",
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't update this milestone.", "error");
    } finally {
      setPendingId(null);
    }
  }

  const allMilestones = [...(milestonesQuery.data ?? [])].sort(
    (a, b) => a.levelNumber - b.levelNumber,
  );
  const milestones = allMilestones.filter((m) =>
    show === "all" ? true : show === "active" ? m.isActive : !m.isActive,
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-h1 text-ink">Milestones</h1>
          <p className="mt-1 text-body text-muted">
            Editing a milestone never changes any user&apos;s existing unlock.
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          Create milestone
        </Button>
      </div>

      {milestonesQuery.isPending && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" label="Loading milestones" />
        </div>
      )}

      {milestonesQuery.isError && (
        <ErrorState
          message="We couldn't load milestones. Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => void milestonesQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      <div className="max-w-xs">
        <Select
          label="Show"
          value={show}
          onChange={(e) => {
            setShow(e.target.value as "active" | "inactive" | "all");
          }}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      {milestonesQuery.data && allMilestones.length > 0 && milestones.length === 0 && (
        <EmptyState
          title={show === "active" ? "No active milestones" : "No inactive milestones"}
          description={
            show === "active"
              ? "Deactivated milestones are hidden: choose “Inactive” or “All” under Show to see them."
              : "Milestones you deactivate appear here. Deactivating never removes anyone's unlock."
          }
        />
      )}

      {milestonesQuery.data &&
        (allMilestones.length === 0 ? (
          <EmptyState
            title="No milestones yet"
            description="Create the first milestone to power the rewards roadmap."
            action={
              <Button variant="primary" onClick={openCreate}>
                Create milestone
              </Button>
            }
          />
        ) : milestones.length === 0 ? null : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Level</TableHeaderCell>
                <TableHeaderCell>Points required</TableHeaderCell>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Unlocked by</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {milestones.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="tabular-nums">{m.levelNumber}</TableCell>
                  <TableCell className="tabular-nums">{m.pointsRequired}</TableCell>
                  <TableCell>{m.title}</TableCell>
                  <TableCell className="tabular-nums">
                    {m.unlockedCount} user{m.unlockedCount === 1 ? "" : "s"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      tone={m.isActive ? "success" : "neutral"}
                      label={m.isActive ? "Active" : "Inactive"}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          openEdit(m);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={m.isActive ? "text-negative" : ""}
                        loading={pendingId === m.id}
                        onClick={() => {
                          if (m.isActive) setDeactivating(m);
                          else void handleToggleActive(m);
                        }}
                      >
                        {m.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <ConfirmDialog
        isOpen={deactivating !== null}
        onClose={() => {
          setDeactivating(null);
        }}
        title="Deactivate milestone"
        description={
          deactivating
            ? `Deactivate level ${String(deactivating.levelNumber)}, “${deactivating.title}”? Users won't see it and can't unlock it. Anyone who already unlocked it keeps that unlock. You can reactivate it later.`
            : ""
        }
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (deactivating) await handleToggleActive(deactivating);
          setDeactivating(null);
        }}
      />

      {/* Mounted only while open and keyed by milestone — the form seeds its
          fields once on mount, so a single always-mounted instance showed
          stale values (a blank Edit, or a Create pre-filled with whatever
          was last edited). */}
      {formOpen && (
        <MilestoneFormModal
          key={editingMilestone?.id ?? "new"}
          isOpen
          {...(editingMilestone ? { milestone: editingMilestone } : {})}
          onClose={() => {
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}
