import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, inlineScriptHashes } from '../lib/csp';

const sha = (body: string) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`;

describe('inlineScriptHashes', () => {
  it('hashes inline scripts and ignores external ones', () => {
    const inline = "document.querySelectorAll('link').forEach(function(l){l.media='all'})";
    const html = `<script src="theme-init.js"></script><script type="module" src="main.js"></script><script>${inline}</script>`;
    expect(inlineScriptHashes(html)).toEqual([sha(inline)]);
  });

  it('returns each hash once and skips empty scripts', () => {
    expect(inlineScriptHashes('<script>a()</script><SCRIPT>a()</SCRIPT><script></script>')).toEqual(
      [sha('a()')],
    );
  });
});

describe('contentSecurityPolicy', () => {
  it('allows same-origin assets, the given hashes and connect origins only', () => {
    const csp = contentSecurityPolicy({
      scriptHashes: ["'sha256-abc='"],
      connect: ['https://api.example.com', 'wss://ws.example.com'],
    });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'sha256-abc='");
    expect(csp).toContain("connect-src 'self' https://api.example.com wss://ws.example.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('*');
  });
});
