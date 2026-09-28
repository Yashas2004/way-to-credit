import { useQueryClient } from "@tanstack/react-query";
import { ISSUE_BODY_MAX, ISSUE_SUBJECT_MAX } from "@way-to-credit/shared";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Textarea } from "../../components/Textarea";
import { ApiError, isTooManyRequestsError } from "../../lib/api";
import { formatRetryAfter } from "../../lib/format";
import { createIssue } from "../../lib/userApi";

export interface NewHelpRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewHelpRequestModal({ isOpen, onClose }: NewHelpRequestModalProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (submitting) return;
    setError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (subject.trim().length < 3 || body.trim().length === 0) {
      setError("Add a short subject (at least 3 characters) and describe the problem.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const thread = await createIssue({ subject: subject.trim(), body });
      await queryClient.invalidateQueries({ queryKey: ["user", "issues"] });
      setSubject("");
      setBody("");
      onClose();
      navigate(`/user/help/${thread.issue.id}`);
    } catch (err) {
      if (isTooManyRequestsError(err)) {
        setError(
          `You've opened several help requests recently. Try again ${formatRetryAfter(err.retryAfterSeconds ?? 60)}, or add to an existing one.`,
        );
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Ask for help">
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <p className="rounded-sm border border-muted/20 bg-canvas px-3 py-2.5 text-small text-muted">
          About a specific description?{" "}
          <Link to="/user/workspace" onClick={handleClose} className="text-brand-ink underline">
            Raise a query from that description instead
          </Link>
          : it can earn you a credit point.
        </p>
        <Input
          label="Subject"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value.slice(0, ISSUE_SUBJECT_MAX));
          }}
          maxLength={ISSUE_SUBJECT_MAX}
          placeholder="e.g. I can't see the loan types for my bank"
          disabled={submitting}
        />
        <Textarea
          label="What's the problem?"
          value={body}
          onChange={(e) => {
            setBody(e.target.value.slice(0, ISSUE_BODY_MAX));
          }}
          maxLength={ISSUE_BODY_MAX}
          rows={6}
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
          <Button type="submit" variant="primary" loading={submitting}>
            Send
          </Button>
        </div>
      </form>
    </Modal>
  );
}
