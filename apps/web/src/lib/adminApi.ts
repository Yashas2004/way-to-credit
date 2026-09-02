import type {
  ActiveSessionsResponse,
  ActivityLogResponse,
  AdjustCreditsRequest,
  AdjustCreditsResponse,
  AdminListQueriesResponse,
  AdminQueryRow,
  Bank,
  CreateMilestoneRequest,
  CreateUserRequest,
  DescriptionGridResponse,
  LoanType,
  MilestoneResponse,
  AdminUserView,
  Status,
  StatsResponse,
  UpdateMilestoneRequest,
  UpsertDescriptionRequest,
} from "@way-to-credit/shared";
import { apiDelete, apiGet, apiPatch, apiPost, apiRequest } from "./api";

// --- Stats -----------------------------------------------------------------

export function fetchStats(): Promise<StatsResponse> {
  return apiGet<StatsResponse>("/api/admin/stats");
}

// --- Banks -------------------------------------------------------------------

export function fetchBanks(includeDeleted = false): Promise<Bank[]> {
  const qs = includeDeleted ? "?includeDeleted=true" : "";
  return apiGet<Bank[]>(`/api/admin/banks${qs}`);
}
export function createBank(name: string): Promise<Bank> {
  return apiPost<Bank>("/api/admin/banks", { name });
}
export function renameBank(id: string, name: string): Promise<Bank> {
  return apiPatch<Bank>(`/api/admin/banks/${id}`, { name });
}
export function deleteBank(id: string): Promise<Bank> {
  return apiDelete<Bank>(`/api/admin/banks/${id}`);
}
export function undeleteBank(id: string): Promise<Bank> {
  return apiPost<Bank>(`/api/admin/banks/${id}/undelete`);
}

// --- Loan types ----------------------------------------------------------------

export function fetchLoanTypes(includeDeleted = false): Promise<LoanType[]> {
  const qs = includeDeleted ? "?includeDeleted=true" : "";
  return apiGet<LoanType[]>(`/api/admin/loan-types${qs}`);
}
export function createLoanType(name: string): Promise<LoanType> {
  return apiPost<LoanType>("/api/admin/loan-types", { name });
}
export function renameLoanType(id: string, name: string): Promise<LoanType> {
  return apiPatch<LoanType>(`/api/admin/loan-types/${id}`, { name });
}
export function deleteLoanType(id: string): Promise<LoanType> {
  return apiDelete<LoanType>(`/api/admin/loan-types/${id}`);
}
export function undeleteLoanType(id: string): Promise<LoanType> {
  return apiPost<LoanType>(`/api/admin/loan-types/${id}/undelete`);
}

/** Active loan types currently attached to a bank — new this stage (gap 2). */
export function fetchLoanTypesForBank(bankId: string): Promise<LoanType[]> {
  return apiGet<LoanType[]>(`/api/admin/banks/${bankId}/loan-types`);
}
export function attachLoanType(bankId: string, loanTypeId: string): Promise<unknown> {
  return apiPost(`/api/admin/banks/${bankId}/loan-types/${loanTypeId}`);
}
export function detachLoanType(bankId: string, loanTypeId: string): Promise<{ status: "ok" }> {
  return apiDelete<{ status: "ok" }>(`/api/admin/banks/${bankId}/loan-types/${loanTypeId}`);
}

// --- Statuses --------------------------------------------------------------

export function fetchStatuses(includeDeleted = false): Promise<Status[]> {
  const qs = includeDeleted ? "?includeDeleted=true" : "";
  return apiGet<Status[]>(`/api/admin/statuses${qs}`);
}
export function createStatus(name: string, sortOrder: number): Promise<Status> {
  return apiPost<Status>("/api/admin/statuses", { name, sortOrder });
}
export function updateStatus(
  id: string,
  input: { name?: string; sortOrder?: number },
): Promise<Status> {
  return apiPatch<Status>(`/api/admin/statuses/${id}`, input);
}
export function deleteStatus(id: string): Promise<Status> {
  return apiDelete<Status>(`/api/admin/statuses/${id}`);
}
export function undeleteStatus(id: string): Promise<Status> {
  return apiPost<Status>(`/api/admin/statuses/${id}/undelete`);
}

// --- Descriptions ------------------------------------------------------------

export function fetchDescriptionGrid(
  bankId: string,
  loanTypeId: string,
): Promise<DescriptionGridResponse> {
  const params = new URLSearchParams({ bankId, loanTypeId });
  return apiGet<DescriptionGridResponse>(`/api/admin/descriptions?${params.toString()}`);
}
export function upsertDescription(input: UpsertDescriptionRequest): Promise<unknown> {
  return apiRequest("/api/admin/descriptions", { method: "PUT", body: input });
}

// --- Users -------------------------------------------------------------------

export function fetchUsers(): Promise<AdminUserView[]> {
  return apiGet<AdminUserView[]>("/api/admin/users");
}
export function createUser(input: CreateUserRequest): Promise<AdminUserView> {
  return apiPost<AdminUserView>("/api/admin/users", input);
}
export function resetUserPassword(id: string, password: string): Promise<{ status: "ok" }> {
  return apiPost<{ status: "ok" }>(`/api/admin/users/${id}/reset-password`, { password });
}
export function deactivateUser(id: string): Promise<AdminUserView> {
  return apiPost<AdminUserView>(`/api/admin/users/${id}/deactivate`);
}
export function reactivateUser(id: string): Promise<AdminUserView> {
  return apiPost<AdminUserView>(`/api/admin/users/${id}/reactivate`);
}

/**
 * `Idempotency-Key` has no dedicated `apiPost` overload (that wrapper takes
 * no custom headers) — calls `apiRequest` directly instead, same as every
 * other admin call here that needs something `apiGet`/`apiPost` don't
 * expose. The caller mints a fresh UUID per submit attempt.
 */
export function adjustUserCredits(
  id: string,
  input: AdjustCreditsRequest,
  idempotencyKey: string,
): Promise<AdjustCreditsResponse> {
  return apiRequest<AdjustCreditsResponse>(`/api/admin/users/${id}/credits`, {
    method: "POST",
    body: input,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

// --- Queries -----------------------------------------------------------------

export function fetchAdminQueries(params: {
  status?: "pending" | "approved" | "rejected";
  userId?: string;
  from?: string;
  to?: string;
  sort?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}): Promise<AdminListQueriesResponse> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.userId) search.set("userId", params.userId);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.sort) search.set("sort", params.sort);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return apiGet<AdminListQueriesResponse>(`/api/admin/queries${qs ? `?${qs}` : ""}`);
}
export function approveQuery(id: string): Promise<AdminQueryRow> {
  return apiPost<AdminQueryRow>(`/api/admin/queries/${id}/approve`);
}
export function rejectQuery(id: string): Promise<AdminQueryRow> {
  return apiPost<AdminQueryRow>(`/api/admin/queries/${id}/reject`);
}

// --- Milestones ----------------------------------------------------------------

export function fetchMilestones(): Promise<MilestoneResponse[]> {
  return apiGet<MilestoneResponse[]>("/api/admin/milestones");
}
export function createMilestone(input: CreateMilestoneRequest): Promise<MilestoneResponse> {
  return apiPost<MilestoneResponse>("/api/admin/milestones", input);
}
export function updateMilestone(
  id: string,
  input: UpdateMilestoneRequest,
): Promise<MilestoneResponse> {
  return apiPatch<MilestoneResponse>(`/api/admin/milestones/${id}`, input);
}
export function deactivateMilestone(id: string): Promise<MilestoneResponse> {
  return apiPost<MilestoneResponse>(`/api/admin/milestones/${id}/deactivate`);
}
export function reactivateMilestone(id: string): Promise<MilestoneResponse> {
  return apiPost<MilestoneResponse>(`/api/admin/milestones/${id}/reactivate`);
}

// --- Activity ------------------------------------------------------------------

export function fetchActivityLog(params: {
  actorId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}): Promise<ActivityLogResponse> {
  const search = new URLSearchParams();
  if (params.actorId) search.set("actorId", params.actorId);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return apiGet<ActivityLogResponse>(`/api/admin/activity${qs ? `?${qs}` : ""}`);
}
export function fetchActiveSessions(): Promise<ActiveSessionsResponse> {
  return apiGet<ActiveSessionsResponse>("/api/admin/sessions/active");
}
