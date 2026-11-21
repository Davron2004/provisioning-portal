import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, ApiErrorCode } from '@provisioning/contracts';
import { ZodError } from 'zod';

export type ApiProblemCode = ApiErrorCode | 'network' | 'invalid_response' | 'unknown';

/** Any failed request, normalized: what the UI shows and what code branches on. */
export interface ApiProblem {
  /** HTTP status; 0 when the server could not be reached or the response was unusable. */
  readonly status: number;
  readonly code: ApiProblemCode;
  /** Safe to show to the person. */
  readonly message: string;
  readonly details?: unknown;
}

const FALLBACK_MESSAGES: Partial<Record<number, string>> = {
  401: 'Your session has expired. Sign in again.',
  403: 'You do not have access to this.',
  404: 'We could not find what you were looking for.',
  429: 'Too many requests. Wait a moment and try again.',
};

/**
 * Turns anything a request can fail with into an ApiProblem: an ApiError body from
 * our API, a network failure, a non-JSON error page, or a response that does not
 * match the contract.
 */
export function toApiProblem(error: unknown): ApiProblem {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return {
        status: 0,
        code: 'network',
        message: 'Cannot reach the server. Check your connection and try again.',
      };
    }
    const body = ApiError.safeParse(error.error);
    if (body.success) {
      const { code, message, details } = body.data.error;
      return { status: error.status, code, message, details };
    }
    return {
      status: error.status,
      code: error.status >= 500 ? 'internal' : 'unknown',
      message:
        FALLBACK_MESSAGES[error.status] ??
        (error.status >= 500
          ? 'The server ran into a problem. Try again in a moment.'
          : 'The request could not be completed.'),
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 0,
      code: 'invalid_response',
      message: 'The server sent a response this app does not understand.',
      details: error.issues,
    };
  }
  return { status: 0, code: 'unknown', message: 'Something went wrong. Try again.' };
}
