import { expect, test, type APIRequestContext } from '@playwright/test';

import { getRuntime } from '../support/runtime';

const unique = (): string => `Seams dress ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** A two-instance assembly with one sewn edge and the rest finished. */
function seamedDocument(): Record<string, unknown> {
  const edges = ['ab', 'bc', 'cd', 'da'];
  return {
    schema: 'sewcraft.pattern/0.9',
    units: 'mm',
    entities: [
      { id: 'a', kind: 'point', x: 0, y: 0, fixed: true, piece: 'p1' },
      { id: 'b', kind: 'point', x: 100, y: 0, fixed: false, piece: 'p1' },
      { id: 'c', kind: 'point', x: 100, y: 100, fixed: false, piece: 'p1' },
      { id: 'd', kind: 'point', x: 0, y: 100, fixed: false, piece: 'p1' },
      { id: 'ab', kind: 'line', start: 'a', end: 'b', piece: 'p1' },
      { id: 'bc', kind: 'line', start: 'b', end: 'c', piece: 'p1' },
      { id: 'cd', kind: 'line', start: 'c', end: 'd', piece: 'p1' },
      { id: 'da', kind: 'line', start: 'd', end: 'a', piece: 'p1' },
    ],
    constraints: [],
    pieces: [{ id: 'p1', name: 'Front', edges, allowances: [] }],
    assemblies: [
      {
        id: 'a1',
        name: 'Shell',
        instances: [
          { id: 'i1', piece: 'p1', x: 0, y: 0 },
          { id: 'i2', piece: 'p1', x: 200, y: 0 },
        ],
        seams: [
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: ['ab'] },
              { instance: 'i2', edges: ['ab'], reversed: true },
            ],
            eased: true,
          },
        ],
        finishedEdges: [
          ...edges.slice(1).map((edge) => ({ instance: 'i1', edge, kind: 'hem' })),
          ...edges.slice(1).map((edge) => ({ instance: 'i2', edge, kind: 'hem' })),
        ],
      },
    ],
    tabs: [
      { kind: 'piece', id: 'p1' },
      { kind: 'assembly', id: 'a1' },
    ],
  };
}

/** The same assembly before anything is sewn or finished. */
function bareDocument(): Record<string, unknown> {
  const document = seamedDocument();
  const assembly = (document.assemblies as Record<string, unknown>[])[0]!;
  delete assembly.seams;
  delete assembly.finishedEdges;
  return document;
}

async function seedProject(
  request: APIRequestContext,
  document: Record<string, unknown> = seamedDocument(),
): Promise<number> {
  const { appUrl } = getRuntime();
  const created = await request.post(`${appUrl}/api/projects`, { data: { name: unique() } });
  expect(created.status()).toBe(201);
  const { data } = (await created.json()) as { data: { id: number } };

  const saved = await request.put(`${appUrl}/api/projects/${data.id}/pattern`, {
    data: { document },
  });
  expect(saved.ok()).toBe(true);
  return data.id;
}

test('stores and returns seams and finished edges at schema 0.9', async ({ request }) => {
  const { appUrl } = getRuntime();
  const id = await seedProject(request);

  const pattern = await request.get(`${appUrl}/api/projects/${id}/pattern`);
  expect(pattern.ok()).toBe(true);
  const body = (await pattern.json()) as {
    data: {
      document: {
        schema: string;
        assemblies: {
          seams: { id: string; eased: boolean; sides: unknown[] }[];
          finishedEdges: unknown[];
        }[];
      };
    };
  };

  expect(body.data.document.schema).toBe('sewcraft.pattern/0.9');
  expect(body.data.document.assemblies[0]!.seams).toEqual([
    {
      id: 's1',
      eased: true,
      sides: [
        { instance: 'i1', edges: ['ab'] },
        { instance: 'i2', edges: ['ab'], reversed: true },
      ],
    },
  ]);
  expect(body.data.document.assemblies[0]!.finishedEdges).toHaveLength(6);
});

test('sews two edges in the assembly and reads the verdict', async ({ page, request }) => {
  const { previewUrl } = getRuntime();
  const id = await seedProject(request, bareDocument());

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${previewUrl}/projects/${id}/edit`);
  await page.locator('[data-testid="tab-assembly-a1"]').click();

  await page.locator('[data-testid="sew"]').click();
  await expect(page.locator('[data-testid="seam-prompt-bar"]')).toBeVisible();

  // A straight SVG path has a zero-size bounding box, so Playwright's click
  // actionability refuses it; dispatch the same pointerdown the canvas listens for.
  await page.locator('[data-testid="seam-hit-i1-bc"]').dispatchEvent('pointerdown', { button: 0 });
  await page.locator('[data-testid="seam-hit-i2-bc"]').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.locator('[data-testid="seam-side-1"]')).toBeVisible();
  await page.screenshot({
    path: '../.ai/specs/assets/seams-and-sewability/integration-sewing.png',
    fullPage: false,
  });

  await page.locator('[data-testid="seam-commit"]').click();
  await expect(page.locator('[data-testid^="seam-row-"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="check-verdict"]')).toContainText('Not sewable');
  await page.screenshot({
    path: '../.ai/specs/assets/seams-and-sewability/integration-check.png',
    fullPage: false,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '../.ai/specs/assets/seams-and-sewability/integration-check-narrow.png',
    fullPage: false,
  });
});
