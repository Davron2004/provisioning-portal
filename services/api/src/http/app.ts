import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { ApiError } from '@provisioning/contracts';
import { actorFromEvent } from '../auth/actor';
import { AppError, BadRequestError } from '../errors';
import { logger } from '../logger';
import type { HttpMethod, Router } from './router';

export interface HttpAppOptions {
  /** Origins allowed by CORS. `*` allows any origin (bearer tokens, no cookies). */
  allowedOrigins: string[];
}

export type HttpApp = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

/**
 * Wraps the router with what every route needs: CORS, caller identity, JSON
 * parsing, and mapping errors to ApiError bodies. API Gateway's Cognito
 * authorizer has already rejected unauthenticated calls in AWS; the claims
 * check here is defence in depth and is what protects the local harness.
 */
export function createHttpApp(router: Router, options: HttpAppOptions): HttpApp {
  return async (event) => {
    const started = Date.now();
    const requestId = event.requestContext?.requestId ?? 'local';
    const cors = corsHeaders(event.headers ?? {}, options.allowedOrigins);
    const method = event.httpMethod.toUpperCase();
    let result: APIGatewayProxyResult;

    try {
      if (method === 'OPTIONS') {
        result = { statusCode: 204, headers: cors, body: '' };
      } else {
        const match = router.match(method, event.path);
        if (match.kind === 'not_found') {
          result = errorResult(404, 'not_found', `No route for ${method} ${event.path}`, cors);
        } else if (match.kind === 'method_not_allowed') {
          result = errorResult(405, 'bad_request', `${method} is not allowed here`, {
            ...cors,
            Allow: match.allowed.join(', '),
          });
        } else {
          const actor = actorFromEvent(event);
          const response = await match.handler({
            method: method as HttpMethod,
            path: event.path,
            params: match.params,
            query: event.queryStringParameters ?? {},
            body: parseJson(event.body, event.isBase64Encoded),
            actor,
            requestId,
          });
          result = jsonResult(response.status, response.body, cors);
        }
      }
    } catch (error) {
      result = toErrorResult(error, cors, requestId);
    }

    logger.info('request', {
      requestId,
      method,
      path: event.path,
      status: result.statusCode,
      durationMs: Date.now() - started,
    });
    return result;
  };
}

function parseJson(body: string | null, base64: boolean): unknown {
  if (body === null || body === '') return undefined;
  const text = base64 ? Buffer.from(body, 'base64').toString('utf8') : body;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BadRequestError('The request body is not valid JSON');
  }
}

function toErrorResult(
  error: unknown,
  cors: Record<string, string>,
  requestId: string,
): APIGatewayProxyResult {
  if (error instanceof AppError) {
    if (error.status >= 500)
      logger.error('request failed', { requestId, error, cause: error.cause });
    return errorResult(error.status, error.code, error.message, cors, error.details);
  }
  logger.error('unhandled error', { requestId, error });
  return errorResult(500, 'internal', 'Something went wrong. Try again in a moment.', cors, {
    requestId,
  });
}

function errorResult(
  status: number,
  code: ApiError['error']['code'],
  message: string,
  headers: Record<string, string>,
  details?: unknown,
): APIGatewayProxyResult {
  const body: ApiError = {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
  return jsonResult(status, body, headers);
}

function jsonResult(
  status: number,
  body: unknown,
  headers: Record<string, string>,
): APIGatewayProxyResult {
  return {
    statusCode: status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

export function corsHeaders(
  requestHeaders: Record<string, string | undefined>,
  allowedOrigins: string[],
): Record<string, string> {
  const origin = Object.entries(requestHeaders).find(([k]) => k.toLowerCase() === 'origin')?.[1];
  const base = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '600',
  };
  if (allowedOrigins.includes('*')) return { ...base, 'Access-Control-Allow-Origin': '*' };
  if (origin && allowedOrigins.includes(origin)) {
    return { ...base, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  }
  return { Vary: 'Origin' };
}
