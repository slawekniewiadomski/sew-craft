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

/** The same 60 mm panels plus a 240 × 40 mm strip sewn between their perimeters. */
function gussetDocument(): Record<string, unknown> {
  const edges = ['ab', 'bc', 'cd', 'da'];
  const stripPoints = [
    { id: 's0', x: 0, y: 0 },
    { id: 's1', x: 60, y: 0 },
    { id: 's2', x: 120, y: 0 },
    { id: 's3', x: 180, y: 0 },
    { id: 's4', x: 240, y: 0 },
    { id: 's5', x: 240, y: 40 },
    { id: 's6', x: 180, y: 40 },
    { id: 's7', x: 120, y: 40 },
    { id: 's8', x: 60, y: 40 },
    { id: 's9', x: 0, y: 40 },
  ];
  const stripEdges = [
    ['t0', 's0', 's1'],
    ['t1', 's1', 's2'],
    ['t2', 's2', 's3'],
    ['t3', 's3', 's4'],
    ['re', 's4', 's5'],
    ['b3', 's5', 's6'],
    ['b2', 's6', 's7'],
    ['b1', 's7', 's8'],
    ['b0', 's8', 's9'],
    ['le', 's9', 's0'],
  ];
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
      ...stripPoints.map((point) => ({ ...point, kind: 'point', fixed: false, piece: 'p2' })),
      ...stripEdges.map(([id, start, end]) => ({ id, kind: 'line', start, end, piece: 'p2' })),
    ],
    constraints: [],
    pieces: [
      { id: 'p1', name: 'Panel', edges, allowances: [] },
      {
        id: 'p2',
        name: 'Strip',
        edges: stripEdges.map(([id]) => id),
        allowances: [],
      },
    ],
    assemblies: [
      {
        id: 'a1',
        name: 'Gusset pouch',
        instances: [
          { id: 'i1', piece: 'p1', x: 0, y: 0 },
          { id: 'i2', piece: 'p1', x: 120, y: 0 },
          { id: 'i3', piece: 'p2', x: 0, y: 200 },
        ],
        seams: [
          {
            id: 's0',
            sides: [
              { instance: 'i1', edges: ['ab'] },
              { instance: 'i3', edges: ['t0'] },
            ],
          },
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: ['bc'] },
              { instance: 'i3', edges: ['t1'] },
            ],
          },
          {
            id: 's2',
            sides: [
              { instance: 'i1', edges: ['cd'] },
              { instance: 'i3', edges: ['t2'], reversed: true },
            ],
          },
          {
            id: 's3',
            sides: [
              { instance: 'i1', edges: ['da'] },
              { instance: 'i3', edges: ['t3'], reversed: true },
            ],
          },
          {
            id: 's4',
            sides: [
              { instance: 'i2', edges: ['ab'] },
              { instance: 'i3', edges: ['b0'] },
            ],
          },
          {
            id: 's5',
            sides: [
              { instance: 'i2', edges: ['bc'] },
              { instance: 'i3', edges: ['b1'] },
            ],
          },
          {
            id: 's6',
            sides: [
              { instance: 'i2', edges: ['cd'] },
              { instance: 'i3', edges: ['b2'], reversed: true },
            ],
          },
          {
            id: 's7',
            sides: [
              { instance: 'i2', edges: ['da'] },
              { instance: 'i3', edges: ['b3'], reversed: true },
            ],
          },
          {
            id: 's8',
            sides: [
              { instance: 'i3', edges: ['le'] },
              { instance: 'i3', edges: ['re'] },
            ],
          },
        ],
        finishedEdges: [],
      },
    ],
    tabs: [
      { kind: 'piece', id: 'p1' },
      { kind: 'piece', id: 'p2' },
      { kind: 'assembly', id: 'a1' },
    ],
  };
}

/** A three-piece skirt: front, back and a waistband; a sewn complex assembly. */
function skirtDocument(): Record<string, unknown> {
  const point = (id: string, x: number, y: number, piece: string) => ({
    id,
    kind: 'point',
    x,
    y,
    fixed: false,
    piece,
  });
  const line = (id: string, start: string, end: string, piece: string) => ({
    id,
    kind: 'line',
    start,
    end,
    piece,
  });
  const entities = [
    point('fa', 0, 0, 'p1'),
    point('fb', 70, 0, 'p1'),
    point('fc', 100, 200, 'p1'),
    point('fd', 0, 200, 'p1'),
    line('fab', 'fa', 'fb', 'p1'),
    line('fbc', 'fb', 'fc', 'p1'),
    line('fcd', 'fc', 'fd', 'p1'),
    line('fda', 'fd', 'fa', 'p1'),
    point('ba', 150, 0, 'p2'),
    point('bb', 220, 0, 'p2'),
    point('bc', 250, 200, 'p2'),
    point('bd', 150, 200, 'p2'),
    line('bab', 'ba', 'bb', 'p2'),
    line('bbc', 'bb', 'bc', 'p2'),
    line('bcd', 'bc', 'bd', 'p2'),
    line('bda', 'bd', 'ba', 'p2'),
    point('w0', 0, 250, 'p3'),
    point('w1', 70, 250, 'p3'),
    point('w2', 140, 250, 'p3'),
    point('w3', 140, 280, 'p3'),
    point('w4', 70, 280, 'p3'),
    point('w5', 0, 280, 'p3'),
    line('u0', 'w0', 'w1', 'p3'),
    line('u1', 'w1', 'w2', 'p3'),
    line('ur', 'w2', 'w3', 'p3'),
    line('u2', 'w3', 'w4', 'p3'),
    line('u3', 'w4', 'w5', 'p3'),
    line('ul', 'w5', 'w0', 'p3'),
  ];
  return {
    schema: 'sewcraft.pattern/0.9',
    units: 'mm',
    entities,
    constraints: [],
    pieces: [
      { id: 'p1', name: 'Skirt front', edges: ['fab', 'fbc', 'fcd', 'fda'], allowances: [] },
      { id: 'p2', name: 'Skirt back', edges: ['bab', 'bbc', 'bcd', 'bda'], allowances: [] },
      { id: 'p3', name: 'Waistband', edges: ['u0', 'u1', 'ur', 'u2', 'u3', 'ul'], allowances: [] },
    ],
    assemblies: [
      {
        id: 'a1',
        name: 'Skirt',
        instances: [
          { id: 'i1', piece: 'p1', x: 0, y: 0 },
          { id: 'i2', piece: 'p2', x: 150, y: 0 },
          { id: 'i3', piece: 'p3', x: 0, y: 250 },
        ],
        seams: [
          {
            id: 'side-r',
            sides: [
              { instance: 'i1', edges: ['fbc'] },
              { instance: 'i2', edges: ['bbc'] },
            ],
          },
          {
            id: 'side-l',
            sides: [
              { instance: 'i1', edges: ['fda'] },
              { instance: 'i2', edges: ['bda'] },
            ],
          },
          {
            id: 'waist-f',
            sides: [
              { instance: 'i1', edges: ['fab'] },
              { instance: 'i3', edges: ['u0'] },
            ],
          },
          {
            id: 'waist-b',
            sides: [
              { instance: 'i2', edges: ['bab'] },
              { instance: 'i3', edges: ['u1'] },
            ],
          },
          {
            id: 'band-end',
            sides: [
              { instance: 'i3', edges: ['ul'] },
              { instance: 'i3', edges: ['ur'] },
            ],
          },
        ],
        finishedEdges: [
          { instance: 'i1', edge: 'fcd', kind: 'hem' },
          { instance: 'i2', edge: 'bcd', kind: 'hem' },
          { instance: 'i3', edge: 'u2', kind: 'fold' },
          { instance: 'i3', edge: 'u3', kind: 'fold' },
        ],
      },
    ],
    tabs: [
      { kind: 'assembly', id: 'a1' },
      { kind: 'piece', id: 'p1' },
      { kind: 'piece', id: 'p2' },
      { kind: 'piece', id: 'p3' },
    ],
  };
}

async function seedProject(request: APIRequestContext): Promise<number> {
  const { appUrl } = getRuntime();
  const created = await request.post(`${appUrl}/api/projects`, { data: { name: unique() } });
  expect(created.status()).toBe(201);
  const { data } = (await created.json()) as { data: { id: number } };

  return seedDocument(request, data.id, pouchDocument());
}

async function seedDocument(
  request: APIRequestContext,
  id: number,
  document: Record<string, unknown>,
): Promise<number> {
  const saved = await request.put(`${getRuntime().appUrl}/api/projects/${id}/pattern`, {
    data: { document },
  });
  expect(saved.ok()).toBe(true);
  return id;
}

test('keeps a complex skirt in the parts sheet and gates the sewn shell', async ({
  page,
  request,
}) => {
  const { previewUrl } = getRuntime();
  const created = await request.post(`${getRuntime().appUrl}/api/projects`, {
    data: { name: unique() },
  });
  const { data } = (await created.json()) as { data: { id: number } };
  await seedDocument(request, data.id, skirtDocument());

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${previewUrl}/projects/${data.id}/edit`);
  await page.locator('[data-testid="preview"]').click();
  await expect(page.locator('[data-testid="preview-dialog"]')).toBeVisible();

  await expect(page.locator('[data-testid^="exploded-panel-"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="preview-seam-row"]')).toHaveCount(5);
  await page.screenshot({
    path: '../.ai/specs/assets/2026-11-07-3d-preview/preview-skirt-exploded.png',
    fullPage: false,
  });

  await page.locator('[data-testid="preview-mode-sewn"]').click();
  await expect(page.locator('[data-testid="preview-sewn-unsupported"]')).toBeVisible();
  await page.screenshot({
    path: '../.ai/specs/assets/2026-11-07-3d-preview/preview-skirt-sewn.png',
    fullPage: false,
  });

  await page.locator('[data-testid="preview-use-exploded"]').click();
  await expect(page.locator('[data-testid^="exploded-panel-"]')).toHaveCount(3);
});

test('explodes a gusseted pouch into faces and a height strip', async ({ page, request }) => {
  const { previewUrl } = getRuntime();
  const created = await request.post(`${getRuntime().appUrl}/api/projects`, {
    data: { name: unique() },
  });
  const { data } = (await created.json()) as { data: { id: number } };
  await seedDocument(request, data.id, gussetDocument());

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${previewUrl}/projects/${data.id}/edit`);
  await page.locator('[data-testid="tab-assembly-a1"]').click();
  await page.locator('[data-testid="preview"]').click();
  await expect(page.locator('[data-testid="preview-dialog"]')).toBeVisible();

  await expect(page.locator('[data-testid^="exploded-panel-"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="exploded-label"]')).toHaveCount(3);
  await expect(page.locator('[data-testid^="exploded-link-"]')).toHaveCount(9);
  await expect(page.locator('[data-testid="preview-seam-row"]')).toHaveCount(9);

  await page.screenshot({
    path: '../.ai/specs/assets/2026-11-07-3d-preview/preview-gusset-exploded.png',
    fullPage: false,
  });

  // The sewn gusset is a closed box: two caps and a wall, six visible faces
  // from the default three-quarter camera (the rest are back-face culled).
  await page.locator('[data-testid="preview-mode-sewn"]').click();
  await expect(page.locator('[data-testid^="preview-face-"]')).toHaveCount(6);
  await page.screenshot({
    path: '../.ai/specs/assets/2026-11-07-3d-preview/preview-gusset-sewn.png',
    fullPage: false,
  });
});

test('previews a sewn pouch and orbits it', async ({ page, request }) => {
  const { previewUrl } = getRuntime();
  const id = await seedProject(request);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${previewUrl}/projects/${id}/edit`);
  await page.locator('[data-testid="tab-assembly-a1"]').click();

  await page.locator('[data-testid="preview"]').click();
  await expect(page.locator('[data-testid="preview-dialog"]')).toBeVisible();

  // Exploded is the default: two flat parts, four seam links and four rows.
  await expect(page.locator('[data-testid^="exploded-panel-"]')).toHaveCount(2);
  await expect(page.locator('[data-testid^="exploded-link-"]')).toHaveCount(4);
  await expect(page.locator('[data-testid="preview-seam-row"]')).toHaveCount(4);
  await page.screenshot({
    path: '../.ai/specs/assets/2026-11-07-3d-preview/preview-exploded.png',
    fullPage: false,
  });

  await page.locator('[data-testid="preview-mode-sewn"]').click();
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
