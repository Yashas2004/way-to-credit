/**
 * Typed fetch wrapper. Always sends `credentials: 'include'` — auth lives
 * in httpOnly cookies the frontend never reads or stores. On a 401 from any
 * route other than the refresh endpoint itself, transparently calls
 * `/api/auth/refresh` once and retries the original request once;
 * concurrent 401s share a single in-flight refresh via the module-level
 * `refreshPromise` rather than each firing their own.
 */

const REFRESH_PATH = "/api/auth/refresh";

export const API_ERROR_CODES = {
  RESOURCE_BUSY: "RESOURCE_BUSY",
  OUTSIDE_ACCESS_WINDOW: "OUTSIDE_ACCESS_WINDOW",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
} as const;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: string, message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isResourceBusyError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === API_ERROR_CODES.RESOURCE_BUSY;
}

export function isOutsideAccessWindowError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === API_ERROR_CODES.OUTSIDE_ACCESS_WINDOW;
}

export function isTooManyRequestsError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === API_ERROR_CODES.TOO_MANY_REQUESTS;
}

// Registered by AuthProvider at startup — api.ts has no React state of its
// own, so a 401-after-failed-refresh or an OUTSIDE_ACCESS_WINDOW response
// clears auth state via these callbacks; the route guards react to that
// state change and redirect. No navigation happens from inside this module.
let onAuthFailure: (() => void) | null = null;
let onOutsideAccessWindow: (() => void) | null = null;

export function registerAuthFailureHandler(handler: () => void): void {
  onAuthFailure = handler;
}

export function registerOutsideAccessWindowHandler(handler: () => void): void {
  onOutsideAccessWindow = handler;
}

interface ParsedErrorBody {
  code: string;
  message: string;
  retryAfterSeconds: number | undefined;
}

async function parseErrorBody(res: Response): Promise<ParsedErrorBody> {
  try {
    const data: unknown = await res.json();
    if (data !== null && typeof data === "object" && "error" in data) {
      const err: unknown = data.error;
      if (err !== null && typeof err === "object" && "code" in err && "message" in err) {
        const e = err as { code: unknown; message: unknown; retryAfterSeconds?: unknown };
        return {
          code: typeof e.code === "string" ? e.code : "UNKNOWN_ERROR",
          message: typeof e.message === "string" ? e.message : "Something went wrong.",
          retryAfterSeconds:
            typeof e.retryAfterSeconds === "number" ? e.retryAfterSeconds : undefined,
        };
      }
    }
  } catch {
    // Body wasn't JSON, or didn't match the envelope shape — fall through.
  }
  return {
    code: "UNKNOWN_ERROR",
    message: `Request failed with status ${String(res.status)}`,
    retryAfterSeconds: undefined,
  };
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

function doFetch(path: string, options: ApiRequestOptions): Promise<Response> {
  return fetch(path, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    // Omit the key entirely rather than setting it to `undefined` — under
    // exactOptionalPropertyTypes, RequestInit's `body` is `BodyInit | null`,
    // not `| undefined`.
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

let refreshPromise: Promise<boolean> | null = null;

/** Concurrent callers all await the same in-flight promise — only one real refresh request is ever sent at a time. */
function refreshAccessToken(): Promise<boolean> {
  refreshPromise ??= doFetch(REFRESH_PATH, { method: "POST" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  let res = await doFetch(path, options);

  if (res.status === 401 && path !== REFRESH_PATH) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch(path, options); // exactly one retry, never looped
    } else {
      onAuthFailure?.();
      const body = await parseErrorBody(res);
      throw new ApiError(body.code, body.message, res.status, body.retryAfterSeconds);
    }
  }

  if (res.status === 401) {
    // Retried once above and still 401 (or this *was* the refresh call
    // itself failing) — surface it, don't attempt another refresh.
    onAuthFailure?.();
  }

  if (!res.ok) {
    const body = await parseErrorBody(res);
    if (body.code === API_ERROR_CODES.OUTSIDE_ACCESS_WINDOW) {
      onOutsideAccessWindow?.();
    }
    throw new ApiError(body.code, body.message, res.status, body.retryAfterSeconds);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body });
}
export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body });
}
export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}
