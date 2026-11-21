import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { HANDLERS } from '@provisioning/api/infra';
import { synthPortal } from './helpers';

/**
 * Bundles every handler the way `cdk synth` does (esbuild, ESM) and loads each
 * bundle in Node. Catches what template assertions cannot: a CommonJS
 * dependency that breaks in an ES module, or a missing export.
 */
describe('Lambda bundles', () => {
  const outdir = mkdtempSync(join(tmpdir(), 'portal-synth-'));
  afterAll(() => rmSync(outdir, { recursive: true, force: true }));

  it('load as ES modules and export a handler', async () => {
    const { app, template } = synthPortal({ bundle: true, outdir });
    app.synth();
    // The API handlers (CDK's own helper functions have no LOG_LEVEL).
    const functions = Object.values(template.findResources('AWS::Lambda::Function')).filter(
      (fn) => fn.Properties.Environment?.Variables?.LOG_LEVEL,
    );
    expect(functions).toHaveLength(Object.keys(HANDLERS).length);
    for (const fn of functions) {
      const assetPath = fn.Metadata['aws:asset:path'] as string;
      const bundle = await import(pathToFileURL(join(outdir, assetPath, 'index.mjs')).href);
      expect(typeof bundle.handler, assetPath).toBe('function');
    }
  });
});
