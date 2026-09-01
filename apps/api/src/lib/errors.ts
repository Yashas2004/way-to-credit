export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace(this, new.target);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = "UNAUTHORIZED";
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = "VALIDATION_ERROR";
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = "CONFLICT";
}

export class InvalidCredentialsError extends AppError {
  readonly statusCode = 401;
  readonly code = "INVALID_CREDENTIALS";
}

export class AccountInactiveError extends AppError {
  readonly statusCode = 401;
  readonly code = "ACCOUNT_INACTIVE";
}

export class OutsideAccessWindowError extends AppError {
  readonly statusCode = 403;
  readonly code = "OUTSIDE_ACCESS_WINDOW";
}

export class TooManyRequestsError extends AppError {
  readonly statusCode = 429;
  readonly code = "TOO_MANY_REQUESTS";
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class HasDependentDescriptionsError extends AppError {
  readonly statusCode = 409;
  readonly code = "HAS_DEPENDENT_DESCRIPTIONS";
}

export class AlreadyAttachedError extends AppError {
  readonly statusCode = 409;
  readonly code = "ALREADY_ATTACHED";
}

/** A `SELECT ... FOR UPDATE` hit `lock_timeout` — see CLAUDE.md invariant #18. */
export class ResourceBusyError extends AppError {
  readonly statusCode = 409;
  readonly code = "RESOURCE_BUSY";
}
