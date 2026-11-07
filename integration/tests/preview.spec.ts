import { expect, test, type APIRequestContext } from '@playwright/test';

import { getRuntime } from '../support/runtime';

const unique = (): string =>
  `Preview pouch ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** A closed two-panel pouch: the whole perimeter is sewn. */
function pouchDocument(): Record<string, unknown> {
  const edges = ['ab', 'bc', 'cd', 'da'];
  return {
    schema: 'sewcraft.pattern/0.9',
    units: 'mm',
    entities: [
      { id: 'a', kind: 'point', x: 0, y: 0, fixed: true, piece: 'p1' },
      { id: 'b', kind: 'point', x: 60, y: 0, fixed: false, piece: 'p1' },
      { id: 'c', kind: 'point', x: 60, y: 60, fixed: false, piece: 'p1' },
      { id: 'd', kind: 'point', x: 0, y: 60, fixed: false, piece: 'p1' },
      { id: 'ab', kind: 'line', start: 'a', end: 'b', piece: 'p1' },
      { id: 'bc', kind: 'line', start: 'b', end: 'c', piece: 'p1' },
      { id: 'cd', kind: 'line', start: 'c', end: 'd', piece: 'p1' },
      { id: 'da', kind: 'line', start: 'd', end: 'a', piece: 'p1' },
    ],
    constraints: [],
    pieces: [{ id: 'p1', name: 'Panel', edges, allowances: [] }],
    assemblies: [
      {
        id: 'a1',
        name: 'Pouch',
        instances: [
          { id: 'i1', piece: 'p1', x: 0, y: 0 },
          { id: 'i2', piece: 'p1', x: 120, y: 0 },
        ],
        // Sew the whole perimeter so the two panels close into a pouch.
        seams: edges.map((edge, index) => ({
          id: `s${index}`,
          sides: [
            { instance: 'i1', edges: [edge] },
            { instance: 'i2', edges: [edge] },
          ],
        })),
        finishedEdges: [],
      },
    ],
    tabs: [
      { kind: 'piece', id: 'p1' },
      { kind: 'assembly', id: 'a1' },
    ],
  };
}

async function seedProject(request: APIRequestContext): Promise<number> {
  const { appUrl } = getRuntime();
  const created = await request.post(`${appUrl}/api/projects`, { data: { name: unique() } });
  expect(created.status()).toBe(201);
  const { data } = (await created.json()) as { data: { id: number } };

  const saved = await request.put(`${appUrl}/api/projects/${data.id}/pattern`, {
    data: { document: pouchDocument() },
  });
  expect(saved.ok()).toBe(true);
  return data.id;
}

test('previews a sewn pouch and orbits it', async ({ page, request }) => {
  const { previewUrl } = getRuntime();
  const id = await seedProject(request);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${previewUrl}/projects/${id}/edit`);
  await page.locator('[data-testid="tab-assembly-a1"]').click();

  await page.locator('[data-testid="preview"]').click();
  await expect(page.locator('[data-testid="preview-dialog"]')).toBeVisible();

  const faces = page.locator('[data-testid^="preview-face-"]');
  await expect(faces.first()).toBeVisible();
  expect(await faces.count()).toBeGreaterThan(20);
  await expect(page.locator('[data-testid="preview-approximate"]')).toHaveCount(0);

  await page.screenshot({
    path: '../.ai/specs/assets/2026-11-07-3d-preview/preview-pouch.png',
    fullPage: false,
  });

  // A left drag rotates the camera; the rendered faces change.
  const before = await faces.first().getAttribute('points');
  const box = (await page.locator('[data-testid="preview-svg"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40);
  await page.mouse.up();
  expect(await faces.first().getAttribute('points')).not.toBe(before);

  await page.locator('[data-testid="preview-wireframe"]').check();
  await expect(faces.first()).toHaveAttribute('fill', 'none');
  await page.screenshot({
    path: '../.ai/specs/assets/2026-11-07-3d-preview/preview-wireframe.png',
    fullPage: false,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '../.ai/specs/assets/2026-11-07-3d-preview/preview-narrow.png',
    fullPage: false,
  });

  await page.locator('[data-testid="preview-close"]').click();
  await expect(page.locator('[data-testid="preview-dialog"]')).toBeHidden();
});
