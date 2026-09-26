import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/Button";
import { IntegerInput } from "../../components/IntegerInput";
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
  const [credits, setCredits] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // IntegerInput guarantees `credits` is only ever "", "-", or an integer
  // string — the API field is still called `delta`, but that's internal.
  const parsedCredits = Number(credits);
  const creditsValid =
    /^-?\d+$/.test(credits) && parsedCredits !== 0 && parsedCredits >= -100 && parsedCredits <= 100;
  const reasonValid = reason.trim().length > 0;

  function handleClose() {
    if (submitting) return;
    setCredits("");
    setReason("");
    setError(null);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!creditsValid || !reasonValid || submitting) return;

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
        { delta: parsedCredits, reason: reason.trim() },
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
      setCredits("");
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
        <IntegerInput
          label="Credits (positive to add, negative to deduct)"
          value={credits}
          onValueChange={setCredits}
          allowNegative
          placeholder="e.g. 5 or -2"
          hint="Whole numbers from -100 to 100, not zero."
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
          <p role="alert" className="text-small text-negative">
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
            disabled={!creditsValid || !reasonValid}
          >
            Adjust
          </Button>
        </div>
      </form>
    </Modal>
  );
}
