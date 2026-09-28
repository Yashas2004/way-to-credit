import type { IssueStatus } from "@way-to-credit/shared";
import type { BadgeTone } from "./Badge";

/**
 * A request's status reads differently depending on whose move it is from
 * where you sit: "awaiting_user" is a to-do for the user, but just waiting
 * for an admin. Attention (amber) marks exactly the side that owes a reply.
 */
export const ISSUE_STATUS_BADGE: Record<
  "user" | "admin",
  Record<IssueStatus, { tone: BadgeTone; label: string }>
> = {
  user: {
    awaiting_admin: { tone: "neutral", label: "Waiting for an admin" },
    awaiting_user: { tone: "attention", label: "Needs your reply" },
    resolved: { tone: "success", label: "Resolved" },
  },
  admin: {
    awaiting_admin: { tone: "attention", label: "Needs a reply" },
    awaiting_user: { tone: "neutral", label: "Waiting for the user" },
    resolved: { tone: "success", label: "Resolved" },
  },
};
