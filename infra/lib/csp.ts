import { createHash } from 'node:crypto';

/**
 * SHA-256 sources for every inline <script> in the built index.html. The
 * Angular build adds one (it switches the non-critical stylesheet from
 * `media="print"` to `all` once loaded); hashing it at synth time lets the CSP
 * allow exactly that script instead of 'unsafe-inline'.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attributes = '', body = ''] = match;
    if (/\bsrc\s*=/i.test(attributes) || body.length === 0) continue;
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return [...hashes];
}

export interface CspSources {
  /** Extra `script-src` entries (inline script hashes). */
  scriptHashes: string[];
  /** Origins the app calls: REST API, WebSocket API, Cognito. */
  connect: string[];
}

/**
 * Content-Security-Policy for the Angular app. Scripts, fonts and icons are
 * all served from the same origin. `style-src 'unsafe-inline'` is needed:
 * Angular inlines critical CSS and injects component styles at runtime.
 */
export function contentSecurityPolicy({ scriptHashes, connect }: CspSources): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...scriptHashes],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...connect],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .concat('upgrade-insecure-requests')
    .join('; ');
}
