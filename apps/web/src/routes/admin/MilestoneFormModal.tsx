import { useQueryClient } from "@tanstack/react-query";
import type { MilestoneResponse } from "@way-to-credit/shared";
import { useState } from "react";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Textarea } from "../../components/Textarea";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { createMilestone, updateMilestone } from "../../lib/adminApi";

export interface MilestoneFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Undefined for create; a milestone for edit — its `levelNumber` is immutable, matching the backend. */
  milestone?: MilestoneResponse;
}

export function MilestoneFormModal({ isOpen, onClose, milestone }: MilestoneFormModalProps) {
  const isEdit = Boolean(milestone);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [levelNumber, setLevelNumber] = useState(milestone ? String(milestone.levelNumber) : "");
  const [pointsRequired, setPointsRequired] = useState(
    milestone ? String(milestone.pointsRequired) : "",
  );
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [message, setMessage] = useState(milestone?.message ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLevelNumber(milestone ? String(milestone.levelNumber) : "");
    setPointsRequired(milestone ? String(milestone.pointsRequired) : "");
    setTitle(milestone?.title ?? "");
    setMessage(milestone?.message ?? "");
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  const parsedLevel = Number(levelNumber);
  const parsedPoints = Number(pointsRequired);
  const valid =
    Number.isInteger(parsedLevel) &&
    parsedLevel > 0 &&
    Number.isInteger(parsedPoints) &&
    parsedPoints > 0 &&
    title.trim().length > 0 &&
    message.trim().length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && milestone) {
        await updateMilestone(milestone.id, {
          title: title.trim(),
          message: message.trim(),
          pointsRequired: parsedPoints,
        });
      } else {
        await createMilestone({
          levelNumber: parsedLevel,
          pointsRequired: parsedPoints,
          title: title.trim(),
          message: message.trim(),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["admin", "milestones"] });
      showToast(isEdit ? "Milestone updated." : "Milestone created.", "success");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? "Edit milestone" : "Create milestone"}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        {isEdit && (
          <p className="rounded-sm bg-paper px-3 py-2 text-small text-slate">
            Editing the title, message, or points required never changes any user&apos;s existing
            unlock — it only changes what a future crossing shows.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Level number"
            type="number"
            value={levelNumber}
            onChange={(e) => {
              setLevelNumber(e.target.value);
            }}
            disabled={submitting || isEdit}
            {...(isEdit ? { hint: "Can't be changed after creation." } : {})}
          />
          <Input
            label="Points required"
            type="number"
            value={pointsRequired}
            onChange={(e) => {
              setPointsRequired(e.target.value);
            }}
            disabled={submitting}
          />
        </div>
        <Input
          label="Title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          disabled={submitting}
        />
        <Textarea
          label="Message"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
          }}
          rows={3}
          disabled={submitting}
        />

        {error && (
          <p role="alert" className="text-small text-alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} disabled={!valid}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
