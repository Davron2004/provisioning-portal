import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (this file is infra/lib/paths.ts). */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const API_ROOT = join(REPO_ROOT, 'services', 'api');

/** Angular build output (`npm run build -w @provisioning/web`). */
export const WEB_BUILD_DIR = join(REPO_ROOT, 'apps', 'web', 'dist', 'web', 'browser');
