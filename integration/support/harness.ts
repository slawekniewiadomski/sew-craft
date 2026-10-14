import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  GenericContainer,
  Network,
  Wait,
  type StartedNetwork,
  type StartedTestContainer,
} from 'testcontainers';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const integrationDir = resolve(here, '..');
const frontendDir = resolve(repoRoot, 'frontend');

const viteBin =
  [
    resolve(repoRoot, 'node_modules', '.bin', 'vite'),
    resolve(frontendDir, 'node_modules', '.bin', 'vite'),
  ].find(existsSync) ?? resolve(repoRoot, 'node_modules', '.bin', 'vite');

const IMAGE = 'sewcraft-app:integration';
const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}`;

export type Runtime = {
  appUrl: string;
  previewUrl: string;
};

let network: StartedNetwork | undefined;
let database: StartedPostgreSqlContainer | undefined;
let app: StartedTestContainer | undefined;
let preview: ChildProcess | undefined;

function run(command: string, args: string[]): void {
  execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
}

async function waitForHttp(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is not accepting connections yet; keep polling.
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${url}`);
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 500));
  }
}

export async function startHarness(): Promise<Runtime> {
  if (process.env.SEWCRAFT_SKIP_IMAGE_BUILD !== '1') {
    run('docker', ['build', '-f', 'docker/integration/Dockerfile', '-t', IMAGE, '.']);
  }

  if (process.env.SEWCRAFT_SKIP_FRONTEND_BUILD !== '1') {
    run('npm', ['run', 'build', '-w', '@sewcraft/frontend']);
  }

  network = await new Network().start();

  database = await new PostgreSqlContainer('postgres:16-alpine')
    .withNetwork(network)
    .withNetworkAliases('db')
    .withDatabase('sewcraft')
    .withUsername('sewcraft')
    .withPassword('secret')
    .start();

  app = await new GenericContainer(IMAGE)
    .withNetwork(network)
    .withEnvironment({
      APP_KEY: 'base64:k2nv6oG4bZ+INsg96TSHsOakAyzmmrl+qM/+YOI2Ml0=',
      APP_ENV: 'production',
      APP_DEBUG: 'false',
      DB_CONNECTION: 'pgsql',
      DB_HOST: 'db',
      DB_PORT: '5432',
      DB_DATABASE: 'sewcraft',
      DB_USERNAME: 'sewcraft',
      DB_PASSWORD: 'secret',
      CACHE_STORE: 'array',
      SESSION_DRIVER: 'array',
      QUEUE_CONNECTION: 'sync',
      LOG_CHANNEL: 'stderr',
    })
    .withExposedPorts(8000)
    .withWaitStrategy(Wait.forHttp('/api/commands', 8000).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start();

  const appUrl = `http://${app.getHost()}:${app.getMappedPort(8000)}`;

  preview = spawn(
    viteBin,
    ['preview', '--port', String(PREVIEW_PORT), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: frontendDir,
      env: { ...process.env, VITE_API_PROXY_TARGET: appUrl },
      stdio: 'inherit',
      detached: true,
    },
  );

  await waitForHttp(PREVIEW_URL);

  const runtime: Runtime = { appUrl, previewUrl: PREVIEW_URL };
  mkdirSync(resolve(integrationDir, '.tmp'), { recursive: true });
  writeFileSync(resolve(integrationDir, '.tmp', 'urls.json'), JSON.stringify(runtime, null, 2));

  return runtime;
}

export async function stopHarness(): Promise<void> {
  if (preview?.pid !== undefined) {
    try {
      process.kill(-preview.pid, 'SIGTERM');
    } catch {
      // The preview process already exited.
    }
  }
  preview = undefined;

  await app?.stop();
  app = undefined;

  await database?.stop();
  database = undefined;

  await network?.stop();
  network = undefined;
}
