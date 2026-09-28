import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { IssueThread } from "../../components/IssueThread";
import { ISSUE_STATUS_BADGE } from "../../components/issueStatus";
import { Spinner } from "../../components/Spinner";
import { ApiError, isTooManyRequestsError } from "../../lib/api";
import { formatIstDateTime, formatRetryAfter } from "../../lib/format";
import { fetchIssueThread, markIssueRead, replyToIssue } from "../../lib/userApi";

const POLL_MS = 30_000;

export function HelpThreadPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const threadKey = ["user", "issues", "thread", id] as const;
  const thread = useQuery({
    queryKey: threadKey,
    queryFn: () => fetchIssueThread(id),
    refetchInterval: POLL_MS,
  });

  // Mark read up to the last entry actually rendered — a message that
  // arrives after this load stays unread.
  const lastSentAt = thread.data?.entries[thread.data.entries.length - 1]?.sentAt;
  const unread = thread.data?.issue.unread;
  useEffect(() => {
    if (!lastSentAt || !unread) return;
    void markIssueRead(id, lastSentAt).then(() =>
      queryClient.invalidateQueries({ queryKey: ["user", "issues"] }),
    );
  }, [id, lastSentAt, unread, queryClient]);

  async function reply(body: string) {
    try {
      const next = await replyToIssue(id, body);
      queryClient.setQueryData(threadKey, next);
      await queryClient.invalidateQueries({ queryKey: ["user", "issues", "list"] });
    } catch (err) {
      if (isTooManyRequestsError(err)) {
        throw new Error(
          `You've sent a lot of messages. Try again ${formatRetryAfter(err.retryAfterSeconds ?? 60)}.`,
        );
      }
      throw err instanceof ApiError ? new Error(err.message) : err;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/user/help" className="text-small text-brand-ink underline">
        ← All help requests
      </Link>

      {thread.isPending && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Loading the conversation" />
        </div>
      )}

      {thread.isError && (
        <ErrorState
          message={
            thread.error instanceof ApiError && thread.error.status === 404
              ? "This help request doesn't exist."
              : "We couldn't load this conversation. Try again."
          }
          action={
            <Button variant="secondary" onClick={() => void thread.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {thread.data && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-serif text-h1 text-ink">{thread.data.issue.subject}</h1>
              <Badge {...ISSUE_STATUS_BADGE.user[thread.data.issue.status]} />
            </div>
            <p className="text-small text-muted">
              Opened {formatIstDateTime(thread.data.issue.openedAt)} IST
            </p>
          </div>
          <IssueThread
            entries={thread.data.entries}
            status={thread.data.issue.status}
            viewer="user"
            onReply={reply}
          />
        </>
      )}
    </div>
  );
}
