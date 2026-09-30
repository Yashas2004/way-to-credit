import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ISSUE_STATUS_BADGE } from "../../components/issueStatus";
import { Spinner } from "../../components/Spinner";
import { dedupeById } from "../../lib/dedupeById";
import { formatIstDateTime } from "../../lib/format";
import { fetchOwnIssues } from "../../lib/userApi";
import { NewHelpRequestModal } from "./NewHelpRequestModal";

const PAGE_SIZE = 20;
const POLL_MS = 30_000;

export function HelpListPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["user", "issues", "list"],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchOwnIssues({ limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: POLL_MS,
  });
  const items = query.data ? dedupeById(query.data.pages) : [];

  return (
    <div className="flex flex-col gap-6">
      {/* The text block shrinks so the action stays beside it: with the
          wider UI font, a fixed block pushed the button onto its own line. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-h1 text-ink">Help requests</h1>
          <p className="mt-1 max-w-[66ch] text-body text-muted">
            For anything else: trouble with the portal, your account, or a question for the admin
            team. An admin will reply here.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setModalOpen(true);
          }}
        >
          Ask for help
        </Button>
      </div>

      {query.isPending && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Loading your help requests" />
        </div>
      )}

      {query.isError && (
        <ErrorState
          message="We couldn't load your help requests. Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {query.isSuccess && items.length === 0 && (
        <EmptyState
          title="No help requests yet"
          description="If something isn't working, ask for help and an admin will reply."
        />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-muted/10 rounded-md bg-white shadow-card">
          {items.map((item) => {
            const badge = ISSUE_STATUS_BADGE.user[item.status];
            return (
              <li key={item.id}>
                <Link
                  to={`/user/help/${item.id}`}
                  className="flex flex-col gap-1.5 px-4 py-4 hover:bg-ink/5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`text-body text-ink ${item.unread ? "font-semibold" : ""}`}>
                      {item.unread && (
                        <>
                          <span
                            aria-hidden="true"
                            className="mr-2 inline-block h-2 w-2 rounded-full bg-brand-ink align-middle"
                          />
                          <span className="sr-only">New reply: </span>
                        </>
                      )}
                      {item.subject}
                    </p>
                    <Badge tone={badge.tone} label={badge.label} />
                  </div>
                  <p className="text-small text-muted">
                    Last activity {formatIstDateTime(item.lastActivityAt)} IST
                    {item.unread && " · New reply"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      )}

      <NewHelpRequestModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
        }}
      />
    </div>
  );
}
