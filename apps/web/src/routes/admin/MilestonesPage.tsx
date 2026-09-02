import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MilestoneResponse } from "@way-to-credit/shared";
import { useState } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
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

  const milestones = [...(milestonesQuery.data ?? [])].sort(
    (a, b) => a.levelNumber - b.levelNumber,
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-h1 text-ink">Milestones</h1>
          <p className="mt-1 text-body text-slate">
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

      {milestonesQuery.data &&
        (milestones.length === 0 ? (
          <EmptyState
            title="No milestones yet"
            description="Create the first milestone to power the rewards roadmap."
            action={
              <Button variant="primary" onClick={openCreate}>
                Create milestone
              </Button>
            }
          />
        ) : (
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
                        onClick={() => {
                          openEdit(m);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className={m.isActive ? "text-alert" : ""}
                        loading={pendingId === m.id}
                        onClick={() => void handleToggleActive(m)}
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

      <MilestoneFormModal
        isOpen={formOpen}
        {...(editingMilestone ? { milestone: editingMilestone } : {})}
        onClose={() => {
          setFormOpen(false);
        }}
      />
    </div>
  );
}
