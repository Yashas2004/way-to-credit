import type {
  DescriptionLookupResponse,
  ListQueriesResponse,
  QueryRow,
  RaiseQueryRequest,
  RewardsMapResponse,
  UserTreeResponse,
} from "@way-to-credit/shared";
import { apiGet, apiPost } from "./api";

/** Fetched once and cached — narrowing the three cascading selects never issues a further request. */
export function fetchUserTree(): Promise<UserTreeResponse> {
  return apiGet<UserTreeResponse>("/api/user/tree");
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
