import type { z } from 'zod';
import { BadRequestError } from '../errors';

export interface FieldIssue {
  path: string;
  message: string;
}

/** Flattens zod issues into `{ path: 'lines.0.user.email', message }` for ApiError details. */
export function zodIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  if (body === undefined) throw new BadRequestError('A JSON request body is required');
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestError('The request body is invalid', { issues: zodIssues(result.error) });
  }
  return result.data;
}

export function parseQuery<S extends z.ZodType>(
  schema: S,
  query: Record<string, string | undefined>,
): z.infer<S> {
  // Empty query values (`?status=`) mean "not set".
  const cleaned = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== ''),
  );
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new BadRequestError('The query string is invalid', { issues: zodIssues(result.error) });
  }
  return result.data;
}
