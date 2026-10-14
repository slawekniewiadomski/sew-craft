import { stopHarness } from './support/harness';

export default async function globalTeardown(): Promise<void> {
  await stopHarness();
}
