/**
 * Serves the production build of the web app the way CloudFront does: static
 * files, index.html for every app route (SPA fallback), and a /config.json
 * that points the app at the local harness on this lane's ports.
 *
 *   node support/serve-web.ts   (WEB_PORT, API_PORT, WS_PORT; run by playwright.config.ts)
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import type { RuntimeConfig } from '@provisioning/contracts';

const root = resolve(import.meta.dirname, '../../apps/web/dist/web/browser');
const webPort = Number(process.env['WEB_PORT'] ?? 4200);
const apiPort = Number(process.env['API_PORT'] ?? 3000);
const wsPort = Number(process.env['WS_PORT'] ?? 3001);

const apiBaseUrl = `http://localhost:${apiPort}`;
const config: RuntimeConfig = {
  apiBaseUrl,
  websocketUrl: `ws://localhost:${wsPort}`,
  auth: { mode: 'local', loginUrl: `${apiBaseUrl}/auth/login` },
  environment: 'local',
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/config.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(config));
      return;
    }
    const requested = normalize(join(root, decodeURIComponent(pathname)));
    const inRoot = requested.startsWith(root);
    // A path with a file extension that does not exist is a real 404; anything else is an app route.
    const file =
      inRoot && (await isFile(requested))
        ? requested
        : extname(pathname)
          ? null
          : join(root, 'index.html');
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(res);
  })().catch((error: unknown) => {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

if (!(await isFile(join(root, 'index.html')))) {
  console.error(`No web build at ${root}. Run \`npm run build -w @provisioning/web\` first.`);
  process.exit(1);
}
server.listen(webPort, 'localhost', () => {
  console.log(`Web app (production build) on http://localhost:${webPort}`);
});
