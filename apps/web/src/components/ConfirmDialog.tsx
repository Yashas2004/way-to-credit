import { useState } from "react";
import { Button, type ButtonVariant } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The dialog's own title — a short label, e.g. "Deactivate user". */
  title: string;
  /** Names exactly what is about to happen — never "Are you sure?" */
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  confirmVariant?: ButtonVariant;
}

/**
 * The one place every destructive action in the admin screens confirms
 * through — names the actual consequence in `description` rather than
 * asking a yes/no question with no content of its own.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmVariant = "danger",
}: ConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-body text-ink">{description}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          loading={submitting}
          onClick={() => void handleConfirm()}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
