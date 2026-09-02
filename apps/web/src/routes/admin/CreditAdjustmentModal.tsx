import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Textarea } from "../../components/Textarea";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { adjustUserCredits } from "../../lib/adminApi";

export interface CreditAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  displayName: string;
}

export function CreditAdjustmentModal({
  isOpen,
  onClose,
  userId,
  displayName,
}: CreditAdjustmentModalProps) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const parsedDelta = Number(delta);
  const deltaValid = delta.trim() !== "" && Number.isInteger(parsedDelta) && parsedDelta !== 0;
  const reasonValid = reason.trim().length > 0;

  function handleClose() {
    if (submitting) return;
    setDelta("");
    setReason("");
    setError(null);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!deltaValid || !reasonValid || submitting) return;

    // Minted fresh inside the handler on every submit attempt — never once
    // on open. A genuine retry after a failed request needs a genuinely new
    // key, or the backend's idempotency guard (same key twice -> one ledger
    // row) would silently replay a stale, possibly-failed reservation
    // instead of applying this new attempt.
    const idempotencyKey = crypto.randomUUID();

    setSubmitting(true);
    setError(null);
    try {
      const res = await adjustUserCredits(
        userId,
        { delta: parsedDelta, reason: reason.trim() },
        idempotencyKey,
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      const milestoneNote =
        res.newlyUnlockedMilestones.length > 0
          ? ` ${displayName} unlocked ${String(res.newlyUnlockedMilestones.length)} new milestone${
              res.newlyUnlockedMilestones.length === 1 ? "" : "s"
            }.`
          : "";
      showToast(`Credits adjusted.${milestoneNote}`, "success");
      setDelta("");
      setReason("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Adjust credits — ${displayName}`}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <Input
          label="Delta (positive to add, negative to deduct)"
          type="number"
          value={delta}
          onChange={(e) => {
            setDelta(e.target.value);
          }}
          placeholder="e.g. 5 or -2"
          disabled={submitting}
        />
        <Textarea
          label="Reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
          rows={3}
          placeholder="Why is this adjustment being made?"
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
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={!deltaValid || !reasonValid}
          >
            Adjust
          </Button>
        </div>
      </form>
    </Modal>
  );
}
