import { startHarness } from './support/harness';

export default async function globalSetup(): Promise<void> {
  const runtime = await startHarness();
  process.env.SEWCRAFT_APP_URL = runtime.appUrl;
  process.env.SEWCRAFT_PREVIEW_URL = runtime.previewUrl;
}
