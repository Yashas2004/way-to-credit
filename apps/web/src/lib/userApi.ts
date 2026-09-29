import type {
  CreateIssueRequest,
  CreditHistoryResponse,
  IssueThread,
  IssueUnreadCount,
  ListIssuesResponse,
  DescriptionLookupResponse,
  ListQueriesResponse,
  QueryRow,
  RaiseQueryRequest,
  RewardsMapResponse,
  WorkspaceNavResponse,
} from "@way-to-credit/shared";
import { apiGet, apiPost } from "./api";

/**
 * The Workspace's navigation data, each list once (statuses, loan types,
 * banks with the loan types they offer as indexes). No description bodies.
 */
export function fetchWorkspaceNav(): Promise<WorkspaceNavResponse> {
  return apiGet<WorkspaceNavResponse>("/api/user/navigation");
}

export function fetchDescription(
  bankId: string,
  loanTypeId: string,
  statusId: string,
): Promise<DescriptionLookupResponse> {
  const params = new URLSearchParams({ bankId, loanTypeId, statusId });
  return apiGet<DescriptionLookupResponse>(`/api/user/description?${params.toString()}`);
}

export function raiseQuery(input: RaiseQueryRequest): Promise<QueryRow> {
  return apiPost<QueryRow>("/api/user/queries", input);
}

export function fetchOwnQueries(params: {
  limit?: number;
  cursor?: string;
}): Promise<ListQueriesResponse> {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return apiGet<ListQueriesResponse>(`/api/user/queries${qs ? `?${qs}` : ""}`);
}

export function fetchRewardsMap(): Promise<RewardsMapResponse> {
  return apiGet<RewardsMapResponse>("/api/user/me/rewards");
}

export function markMilestoneSeen(milestoneId: string): Promise<{ status: "ok" }> {
  return apiPost<{ status: "ok" }>(`/api/user/me/milestones/${milestoneId}/seen`);
}

export function fetchCreditHistory(params: {
  limit?: number;
  cursor?: string;
}): Promise<CreditHistoryResponse> {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return apiGet<CreditHistoryResponse>(`/api/user/me/credits/history${qs ? `?${qs}` : ""}`);
}

// ---- help requests ----------------------------------------------------------

export function fetchOwnIssues(params: {
  limit?: number;
  cursor?: string;
}): Promise<ListIssuesResponse> {
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return apiGet<ListIssuesResponse>(`/api/user/issues${qs ? `?${qs}` : ""}`);
}

export function fetchIssueUnreadCount(): Promise<IssueUnreadCount> {
  return apiGet<IssueUnreadCount>("/api/user/issues/unread-count");
}

export function createIssue(input: CreateIssueRequest): Promise<IssueThread> {
  return apiPost<IssueThread>("/api/user/issues", input);
}

export function fetchIssueThread(id: string): Promise<IssueThread> {
  return apiGet<IssueThread>(`/api/user/issues/${id}`);
}

export function replyToIssue(id: string, body: string): Promise<IssueThread> {
  return apiPost<IssueThread>(`/api/user/issues/${id}/messages`, { body });
}

export async function markIssueRead(id: string, upTo: string): Promise<void> {
  await apiPost<undefined>(`/api/user/issues/${id}/read`, { upTo });
}
