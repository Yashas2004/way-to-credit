import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminIssueThread } from "@way-to-credit/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { IssueThread } from "../../components/IssueThread";
import { ISSUE_STATUS_BADGE } from "../../components/issueStatus";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/Toast";
import {
  fetchAdminIssueThread,
  markIssueReadAsAdmin,
  reopenIssue,
  replyToIssueAsAdmin,
  resolveIssue,
} from "../../lib/adminApi";
import { ApiError } from "../../lib/api";
import { formatIstDateTime } from "../../lib/format";

const POLL_MS = 30_000;

export function AdminHelpThreadPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [acting, setActing] = useState<"resolve" | "reopen" | null>(null);
  const threadKey = ["admin", "issues", "thread", id] as const;
  const thread = useQuery({
    queryKey: threadKey,
    queryFn: () => fetchAdminIssueThread(id),
    refetchInterval: POLL_MS,
  });

  // Mark read (for this admin) up to the last entry actually rendered.
  const lastSentAt = thread.data?.entries[thread.data.entries.length - 1]?.sentAt;
  const unread = thread.data?.issue.unread;
  useEffect(() => {
    if (!lastSentAt || !unread) return;
    void markIssueReadAsAdmin(id, lastSentAt).then(() =>
      queryClient.invalidateQueries({ queryKey: ["admin", "issues"] }),
    );
  }, [id, lastSentAt, unread, queryClient]);

  async function apply(next: Promise<AdminIssueThread>) {
    const updated = await next;
    queryClient.setQueryData(threadKey, updated);
    await queryClient.invalidateQueries({ queryKey: ["admin", "issues", "list"] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  }

  async function reply(body: string) {
    try {
      await apply(replyToIssueAsAdmin(id, body));
    } catch (err) {
      throw err instanceof ApiError ? new Error(err.message) : err;
    }
  }

  async function changeStatus(action: "resolve" | "reopen") {
    setActing(action);
    try {
      await apply(action === "resolve" ? resolveIssue(id) : reopenIssue(id));
      showToast(action === "resolve" ? "Marked resolved." : "Reopened.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong.", "error");
    } finally {
      setActing(null);
    }
  }

  const data = thread.data;
  return (
    <div className="flex flex-col gap-6 p-6">
      <Link to="/admin/help" className="text-small text-brand-ink underline">
        ← All help requests
      </Link>

      {thread.isPending && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Loading the conversation" />
        </div>
      )}

      {thread.isError && (
        <ErrorState
          message="We couldn't load this help request. Try again."
          action={
            <Button variant="secondary" onClick={() => void thread.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {data && (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-serif text-h1 text-ink">{data.issue.subject}</h1>
              <Badge {...ISSUE_STATUS_BADGE.admin[data.issue.status]} />
            </div>
            <p className="text-small text-muted">
              Raised by {data.issue.raisedByDisplayName} ({data.issue.raisedByUserId}) ·{" "}
              {formatIstDateTime(data.issue.openedAt)} IST
            </p>
          </div>
          <IssueThread
            entries={data.entries}
            status={data.issue.status}
            viewer="admin"
            onReply={reply}
            actions={
              data.issue.status === "resolved" ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={acting === "reopen"}
                  onClick={() => void changeStatus("reopen")}
                >
                  Reopen
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  loading={acting === "resolve"}
                  onClick={() => void changeStatus("resolve")}
                >
                  Mark resolved
                </Button>
              )
            }
          />
        </>
      )}
    </div>
  );
}
