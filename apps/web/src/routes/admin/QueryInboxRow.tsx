import type { AdminQueryRow, QueryStatus } from "@way-to-credit/shared";
import { ActorLabel } from "../../components/ActorLabel";
import { Badge, type BadgeTone } from "../../components/Badge";
import { Button } from "../../components/Button";
import { formatIstDateTime, formatRelativeTime } from "../../lib/format";
import type { ActorName } from "../../lib/useActorNames";

const STATUS_TONE: Record<QueryStatus, BadgeTone> = {
  pending: "attention",
  approved: "success",
  rejected: "negative",
};
const STATUS_LABEL: Record<QueryStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/**
 * One query in the inbox, laid out to act on at a glance. From `lg` up it's
 * one row of three columns: what (the combination and the user's message) |
 * who and when | the outcome, or Approve / Reject. Below `lg` the three
 * stack. Before, the combination, message, meta line and buttons stacked at
 * every width: 162px rows, five of eight queries visible at 1920. Shared by
 * the Query inbox and the dashboard.
 */
export function QueryInboxRow({
  item,
  raisedBy,
  pending,
  onApprove,
  onReject,
}: {
  item: AdminQueryRow;
  raisedBy: ActorName;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 px-5 py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_13rem_auto] lg:items-center lg:gap-x-6">
      <div className="min-w-0">
        <p className="truncate text-small text-muted">
          {item.bankNameSnapshot} · {item.loanTypeNameSnapshot}
        </p>
        <p className="text-body font-medium text-ink">{item.statusNameSnapshot}</p>
        <p className="mt-0.5 max-w-[80ch] text-body text-ink">{item.message}</p>
      </div>
      <div className="text-small text-muted">
        <p className="text-body text-ink">
          <ActorLabel actor={raisedBy} />
        </p>
        <p title={`${formatIstDateTime(item.raisedAt)} IST`}>
          Raised {formatRelativeTime(item.raisedAt)}
        </p>
      </div>
      <div className="flex items-center gap-2 lg:justify-end">
        {item.status === "pending" ? (
          <>
            <Button
              size="sm"
              variant="primary"
              loading={pending}
              disabled={pending}
              onClick={onApprove}
            >
              Approve (+1 credit)
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={pending}
              disabled={pending}
              onClick={onReject}
            >
              Reject
            </Button>
          </>
        ) : (
          <Badge tone={STATUS_TONE[item.status]} label={STATUS_LABEL[item.status]} />
        )}
      </div>
    </li>
  );
}
