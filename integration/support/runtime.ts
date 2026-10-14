import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Runtime = {
  appUrl: string;
  previewUrl: string;
};

/**
 * Resolve the URLs of the containers started by the global setup. Prefers the
 * environment (set by global setup in the runner process, inherited by workers)
 * and falls back to the file written by the harness.
 */
export function getRuntime(): Runtime {
  const { SEWCRAFT_APP_URL, SEWCRAFT_PREVIEW_URL } = process.env;

  if (SEWCRAFT_APP_URL && SEWCRAFT_PREVIEW_URL) {
    return { appUrl: SEWCRAFT_APP_URL, previewUrl: SEWCRAFT_PREVIEW_URL };
  }

  const path = fileURLToPath(new URL('../.tmp/urls.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as Runtime;
}
