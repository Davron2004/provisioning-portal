import type { ApiErrorCode } from '@provisioning/contracts';

/**
 * Errors that map to an ApiError response. Domain code throws these; the HTTP
 * layer turns them into `{ error: { code, message, details } }` with the
 * matching status. Anything else becomes a 500 `internal`.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'bad_request', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Missing or invalid credentials') {
    super(401, 'unauthorized', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'conflict', message, details);
  }
}

/** The request was well-formed but breaks an order rule; details carry the ValidationIssues. */
export class ValidationFailedError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, 'validation_failed', message, details);
  }
}

export class AssistantUnavailableError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(502, 'assistant_unavailable', message);
    if (options?.cause) this.cause = options.cause;
  }
}
