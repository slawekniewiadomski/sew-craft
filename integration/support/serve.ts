import { startHarness, stopHarness } from './harness';

/**
 * Start the integration harness (Postgres + API + SPA) and leave it running so
 * an agent can drive the SPA with `npx agent-browser`. Prints the URLs, then
 * waits until interrupted.
 */
async function main(): Promise<void> {
  const runtime = await startHarness();

  console.log(`\n  API:      ${runtime.appUrl}`);
  console.log(`  Frontend: ${runtime.previewUrl}\n`);
  console.log('  Drive it with:  npx agent-browser');
  console.log('  Press Ctrl+C to stop.\n');

  const shutdown = async (): Promise<void> => {
    await stopHarness();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();
