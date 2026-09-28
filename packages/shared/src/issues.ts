import { z } from "zod";
import { uuidParam } from "./common.js";

/**
 * Help requests: threaded user <-> admin conversations, permanent record.
 * Bodies are plain text, always rendered as text, never as HTML.
 */
export const ISSUE_SUBJECT_MAX = 150;
export const ISSUE_BODY_MAX = 5000;

/** Normalise line endings first, then trim — so a whitespace-only body fails `.min(1)`. */
const issueBody = z
  .string()
  .transform((s) => s.replace(/\r\n?/g, "\n"))
  .pipe(z.string().trim().min(1).max(ISSUE_BODY_MAX));

export const IssueStatusSchema = z.enum(["awaiting_admin", "awaiting_user", "resolved"]);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

/** A status filter: one status, or "open" (awaiting either side). */
export const IssueStatusFilterSchema = z.enum([
  "open",
  "awaiting_admin",
  "awaiting_user",
  "resolved",
]);
export type IssueStatusFilter = z.infer<typeof IssueStatusFilterSchema>;

export const CreateIssueRequestSchema = z.object({
  subject: z.string().trim().min(3).max(ISSUE_SUBJECT_MAX),
  body: issueBody,
});
export type CreateIssueRequest = z.infer<typeof CreateIssueRequestSchema>;

export const PostIssueMessageRequestSchema = z.object({ body: issueBody });
export type PostIssueMessageRequest = z.infer<typeof PostIssueMessageRequestSchema>;

/** Mark read up to the `sentAt` of the last entry the client actually rendered. */
export const MarkIssueReadRequestSchema = z.object({ upTo: z.string().datetime() });
export type MarkIssueReadRequest = z.infer<typeof MarkIssueReadRequestSchema>;

export const ListIssuesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().optional(),
});
export type ListIssuesQuery = z.infer<typeof ListIssuesQuerySchema>;

export const AdminListIssuesQuerySchema = ListIssuesQuerySchema.extend({
  status: IssueStatusFilterSchema.optional(),
  userId: uuidParam.optional(),
});
export type AdminListIssuesQuery = z.infer<typeof AdminListIssuesQuerySchema>;

export const IssueSummarySchema = z.object({
  id: uuidParam,
  subject: z.string(),
  status: IssueStatusSchema,
  openedAt: z.string(),
  lastActivityAt: z.string(),
  resolvedAt: z.string().nullable(),
  /** Unread for whoever is asking: the raiser (admin replies) or this admin (user messages). */
  unread: z.boolean(),
});
export type IssueSummary = z.infer<typeof IssueSummarySchema>;

export const AdminIssueSummarySchema = IssueSummarySchema.extend({
  raisedBy: uuidParam,
  raisedByUserId: z.string(),
  raisedByDisplayName: z.string(),
});
export type AdminIssueSummary = z.infer<typeof AdminIssueSummarySchema>;

export const IssueEntryKindSchema = z.enum(["message", "resolved", "reopened"]);
export type IssueEntryKind = z.infer<typeof IssueEntryKindSchema>;

export const IssueEntrySchema = z.object({
  id: uuidParam,
  kind: IssueEntryKindSchema,
  authorType: z.enum(["admin", "user"]),
  authorName: z.string(),
  /** Empty for status events. */
  body: z.string(),
  sentAt: z.string(),
});
export type IssueEntry = z.infer<typeof IssueEntrySchema>;

export const IssueThreadSchema = z.object({
  issue: IssueSummarySchema,
  entries: z.array(IssueEntrySchema),
});
export type IssueThread = z.infer<typeof IssueThreadSchema>;

export const AdminIssueThreadSchema = z.object({
  issue: AdminIssueSummarySchema,
  entries: z.array(IssueEntrySchema),
});
export type AdminIssueThread = z.infer<typeof AdminIssueThreadSchema>;

export const ListIssuesResponseSchema = z.object({
  items: z.array(IssueSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ListIssuesResponse = z.infer<typeof ListIssuesResponseSchema>;

export const AdminListIssuesResponseSchema = z.object({
  items: z.array(AdminIssueSummarySchema),
  nextCursor: z.string().nullable(),
});
export type AdminListIssuesResponse = z.infer<typeof AdminListIssuesResponseSchema>;

export const IssueUnreadCountSchema = z.object({ count: z.number().int() });
export type IssueUnreadCount = z.infer<typeof IssueUnreadCountSchema>;
