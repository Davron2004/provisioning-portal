import type { Actor } from '../auth/actor';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestContext {
  method: HttpMethod;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  /** Parsed JSON body, or undefined when there is none. */
  body: unknown;
  actor: Actor;
  requestId: string;
}

export interface RouteResult {
  status: number;
  body: unknown;
}

export type RouteHandler = (ctx: RequestContext) => Promise<RouteResult>;

interface Route {
  method: HttpMethod;
  pattern: string;
  segments: string[];
  handler: RouteHandler;
}

export type RouteMatch =
  | { kind: 'matched'; handler: RouteHandler; params: Record<string, string>; pattern: string }
  | { kind: 'method_not_allowed'; allowed: HttpMethod[] }
  | { kind: 'not_found' };

/**
 * A small path router for the single REST Lambda. API Gateway forwards every
 * path (`/{proxy+}`) here; routes use `{name}` placeholders. Literal segments
 * win over placeholders, so `/orders/preview` is never read as an order id.
 */
export class Router {
  private readonly routes: Route[] = [];

  on(method: HttpMethod, pattern: string, handler: RouteHandler): this {
    this.routes.push({ method, pattern, segments: split(pattern), handler });
    // Most literal segments first, so specific routes shadow parameterised ones.
    this.routes.sort((a, b) => literalCount(b) - literalCount(a));
    return this;
  }

  get(pattern: string, handler: RouteHandler): this {
    return this.on('GET', pattern, handler);
  }

  post(pattern: string, handler: RouteHandler): this {
    return this.on('POST', pattern, handler);
  }

  match(method: string, path: string): RouteMatch {
    const parts = split(path);
    const allowed = new Set<HttpMethod>();
    for (const route of this.routes) {
      const params = matchSegments(route.segments, parts);
      if (!params) continue;
      if (route.method === method) {
        return { kind: 'matched', handler: route.handler, params, pattern: route.pattern };
      }
      allowed.add(route.method);
    }
    return allowed.size > 0
      ? { kind: 'method_not_allowed', allowed: [...allowed] }
      : { kind: 'not_found' };
  }
}

function split(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

function literalCount(route: Route): number {
  return route.segments.filter((s) => !s.startsWith('{')).length;
}

function matchSegments(pattern: string[], parts: string[]): Record<string, string> | null {
  if (pattern.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const expected = pattern[i]!;
    const actual = parts[i]!;
    if (expected.startsWith('{') && expected.endsWith('}')) {
      let value: string;
      try {
        value = decodeURIComponent(actual);
      } catch {
        return null;
      }
      params[expected.slice(1, -1)] = value;
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}
