/** The wire shape errorHandler.ts always produces for a failed request. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
  };
}

/** Narrows a Supertest/fetch response body (typed `any`/`unknown`) to the error envelope shape for assertions. */
export function readErrorBody(body: unknown): ErrorEnvelope {
  return body as ErrorEnvelope;
}
