import { ISSUE_BODY_MAX, type IssueEntry, type IssueStatus } from "@way-to-credit/shared";
import { useState, type FormEvent, type ReactNode } from "react";
import { formatIstDateTime } from "../lib/format";
import { Button } from "./Button";
import { Textarea } from "./Textarea";

export interface IssueThreadProps {
  entries: IssueEntry[];
  status: IssueStatus;
  /** Whose screen this is — labels the other side, and words the reply hint. */
  viewer: "user" | "admin";
  onReply: (body: string) => Promise<void>;
  /** Admin-only actions (resolve / reopen), rendered beside the reply button. */
  actions?: ReactNode;
}

const COUNTER_THRESHOLD = 200;

/**
 * A help request's full history, oldest first, then the reply box.
 *
 * Every body is user- or admin-supplied text and is only ever rendered as a
 * React text node in a pre-wrap paragraph — never as HTML, markdown or
 * auto-linked text. Status changes are thread entries, shown as quiet
 * system lines. Author role is always a text label, never colour alone.
 */
export function IssueThread({ entries, status, viewer, onReply, actions }: IssueThreadProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = ISSUE_BODY_MAX - draft.length;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim().length === 0) {
      setError("Write a message first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onReply(draft);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-3" aria-label="Conversation">
        {entries.map((entry) =>
          entry.kind === "message" ? (
            <li
              key={entry.id}
              className={`rounded-sm border-l-2 bg-surface px-4 py-3 shadow-card ${
                entry.authorType === "admin" ? "border-brand-ink" : "border-muted/40"
              }`}
            >
              <p className="flex flex-wrap items-baseline gap-x-2 text-small text-muted">
                <span className="font-medium text-ink">
                  {entry.authorType === viewer && viewer === "user" ? "You" : entry.authorName}
                </span>
                <span>{entry.authorType === "admin" ? "Admin" : "User"}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={entry.sentAt}>{formatIstDateTime(entry.sentAt)} IST</time>
              </p>
              <p className="mt-1.5 max-w-[66ch] whitespace-pre-wrap break-words text-body text-ink">
                {entry.body}
              </p>
            </li>
          ) : (
            <li key={entry.id} className="px-4 text-center text-small text-muted">
              {entry.kind === "resolved" ? "Resolved" : "Reopened"} by {entry.authorName} ·{" "}
              <time dateTime={entry.sentAt}>{formatIstDateTime(entry.sentAt)} IST</time>
            </li>
          ),
        )}
      </ol>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
        <div>
          <Textarea
            label="Your reply"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, ISSUE_BODY_MAX));
            }}
            maxLength={ISSUE_BODY_MAX}
            rows={4}
            disabled={sending}
            {...(status === "resolved"
              ? {
                  hint:
                    viewer === "user"
                      ? "This request is resolved. Replying will reopen it."
                      : "This request is resolved. Replying will reopen it for the user.",
                }
              : {})}
          />
          {remaining <= COUNTER_THRESHOLD && (
            <p className="mt-1 text-right text-small text-muted">
              {remaining} character{remaining === 1 ? "" : "s"} left
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-small text-negative">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={sending}>
            Send reply
          </Button>
          {actions}
        </div>
      </form>
    </div>
  );
}
