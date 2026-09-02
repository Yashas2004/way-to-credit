import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/Button";
import { IstClock } from "../../components/IstClock";
import { Modal } from "../../components/Modal";
import { Textarea } from "../../components/Textarea";
import { useToast } from "../../components/Toast";
import { ApiError, isTooManyRequestsError } from "../../lib/api";
import { formatRetryAfter } from "../../lib/format";
import { isWarningWindow } from "../../lib/ist";
import { raiseQuery } from "../../lib/userApi";

export interface RaiseQueryContext {
  bankId: string;
  bankName: string;
  loanTypeId: string;
  loanTypeName: string;
  statusId: string;
  statusName: string;
}

export interface RaiseQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: RaiseQueryContext;
}

const MESSAGE_MAX = 1000;
// Only shown once the remaining budget is tight — "a live count near the
// limit rather than always."
const COUNTER_THRESHOLD = 120;

export function RaiseQueryModal({ isOpen, onClose, context }: RaiseQueryModalProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const remaining = MESSAGE_MAX - message.length;
  const trimmedEmpty = message.trim().length === 0;

  function handleClose() {
    if (submitting) return;
    setMessage("");
    setError(null);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (trimmedEmpty || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await raiseQuery({
        bankId: context.bankId,
        loanTypeId: context.loanTypeId,
        statusId: context.statusId,
        message: message.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["user", "queries"] });
      showToast("Query raised.", "success");
      setMessage("");
      onClose();
    } catch (err) {
      if (isTooManyRequestsError(err)) {
        const retry = err.retryAfterSeconds ?? 60;
        setError(`Too many queries raised. Try again ${formatRetryAfter(retry)}.`);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Raise a query">
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        {isWarningWindow(new Date()) && (
          <div className="flex items-center justify-between rounded-sm bg-alert/10 px-3 py-2 text-small text-alert">
            <span>The portal closes for the day soon — finish and submit when ready.</span>
            <IstClock variant="user" compact />
          </div>
        )}

        <dl className="grid grid-cols-3 gap-x-3 gap-y-1 rounded-sm border border-slate/20 bg-paper px-3 py-2.5 text-small">
          <dt className="text-slate">Bank</dt>
          <dd className="col-span-2 text-ink">{context.bankName}</dd>
          <dt className="text-slate">Loan type</dt>
          <dd className="col-span-2 text-ink">{context.loanTypeName}</dd>
          <dt className="text-slate">Status</dt>
          <dd className="col-span-2 text-ink">{context.statusName}</dd>
        </dl>

        <div>
          <Textarea
            label="What would you like to ask?"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value.slice(0, MESSAGE_MAX));
            }}
            maxLength={MESSAGE_MAX}
            rows={5}
            placeholder="Describe what's unclear or missing about this status."
            disabled={submitting}
          />
          {remaining <= COUNTER_THRESHOLD && (
            <p className="mt-1 text-right text-small text-slate">
              {remaining} character{remaining === 1 ? "" : "s"} left
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-small text-alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} disabled={trimmedEmpty}>
            Raise query
          </Button>
        </div>
      </form>
    </Modal>
  );
}
