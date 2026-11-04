import { expect, test, type APIRequestContext } from '@playwright/test';

import { getRuntime } from '../support/runtime';

const unique = (): string =>
  `Variables dress ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** A document with one variable and one dimension driven by its formula. */
function seededDocument(): Record<string, unknown> {
  return {
    schema: 'sewcraft.pattern/0.5',
    units: 'mm',
    entities: [
      { id: 'a', kind: 'point', x: 0, y: 0, fixed: true, piece: 'p' },
      { id: 'b', kind: 'point', x: 220, y: 0, fixed: false, piece: 'p' },
      { id: 'c', kind: 'point', x: 220, y: 100, fixed: false, piece: 'p' },
      { id: 'd', kind: 'point', x: 0, y: 100, fixed: false, piece: 'p' },
      { id: 'l1', kind: 'line', start: 'a', end: 'b', piece: 'p' },
      { id: 'l2', kind: 'line', start: 'b', end: 'c', piece: 'p' },
      { id: 'l3', kind: 'line', start: 'c', end: 'd', piece: 'p' },
      { id: 'l4', kind: 'line', start: 'd', end: 'a', piece: 'p' },
    ],
    constraints: [
      {
        id: 'd',
        type: 'distance',
        a: 'a',
        b: 'b',
        value: { expr: '$bust / 4', lastKnown: 220 },
        orientation: 'horizontal',
        offset: 20,
      },
    ],
    pieces: [{ id: 'p', name: 'Bodice', edges: ['l1', 'l2', 'l3', 'l4'], allowances: [] }],
    assemblies: [],
    tabs: [{ kind: 'piece', id: 'p' }],
    variables: [{ slug: 'bust', name: 'Bust', unit: 'mm', value: 880 }],
  };
}

async function seedProject(request: APIRequestContext): Promise<number> {
  const { appUrl } = getRuntime();
  const created = await request.post(`${appUrl}/api/projects`, { data: { name: unique() } });
  expect(created.status()).toBe(201);
  const { data } = (await created.json()) as { data: { id: number } };

  const saved = await request.put(`${appUrl}/api/projects/${data.id}/pattern`, {
    data: { document: seededDocument() },
  });
  expect(saved.ok()).toBe(true);
  return data.id;
}

test('stores and returns variables and formula parameters', async ({ request }) => {
  const { appUrl } = getRuntime();
  const id = await seedProject(request);

  const pattern = await request.get(`${appUrl}/api/projects/${id}/pattern`);
  expect(pattern.ok()).toBe(true);
  const body = (await pattern.json()) as {
    data: {
      document: {
        schema: string;
        variables: { slug: string; unit: string; value: unknown }[];
        constraints: { value: unknown }[];
      };
    };
  };

  expect(body.data.document.schema).toBe('sewcraft.pattern/0.5');
  expect(body.data.document.variables).toEqual([
    { slug: 'bust', name: 'Bust', unit: 'mm', value: 880 },
  ]);
  expect(body.data.document.constraints[0]?.value).toEqual({
    expr: '$bust / 4',
    lastKnown: 220,
  });
});

test('drives a dimension from the variables panel and flags it when broken', async ({
  page,
  request,
}) => {
  const { previewUrl } = getRuntime();
  const id = await seedProject(request);

  await page.goto(`${previewUrl}/projects/${id}/edit`);
  await expect(page.getByText(/command\(s\)/)).toBeVisible();

  await page.locator('[data-testid="sidebar-tab-variables"]').click();
  await expect(page.locator('[data-testid="variable-bust"]')).toBeVisible();
  await expect(page.locator('[data-testid="variable-value-bust"]')).toHaveValue('880');
  await page.screenshot({
    path: '../.ai/runs/assets/2026-11-03-variables-and-expressions/01-variables-panel.png',
    fullPage: false,
  });

  // A second variable defined by a formula over the first.
  await page.locator('[data-testid="add-variable"]').click();
  const added = page.locator('[data-testid^="variable-name-"]').last();
  await added.fill('Ease');
  await added.blur();
  const addedSlug = await added.getAttribute('data-testid');
  const slug = addedSlug!.replace('variable-name-', '');
  await page.locator(`[data-testid="variable-value-${slug}"]`).fill('$bust/10');
  await page.locator(`[data-testid="variable-value-${slug}"]`).blur();
  await expect(page.locator(`[data-testid="variable-type-${slug}"]`)).toHaveText('Formula');
  await expect(page.locator(`[data-testid="variable-value-${slug}"]`)).toHaveAttribute(
    'title',
    '88 mm',
  );
  await page.screenshot({
    path: '../.ai/runs/assets/2026-11-03-variables-and-expressions/02-formula-variable.png',
    fullPage: false,
  });

  // The dimension drawer edits the formula as written.
  await page.locator('[data-testid="sidebar-tab-dimensions"]').click();
  await expect(page.locator('[data-testid="dimension-state-d"]')).toHaveText('Formula');
  await expect(page.locator('[data-testid="dimension-value-d"]')).toHaveValue('$bust / 4');
  await page.screenshot({
    path: '../.ai/runs/assets/2026-11-03-variables-and-expressions/03-formula-dimension.png',
    fullPage: false,
  });

  // Typing `$` offers the document's variables, like `#` offers dimensions.
  await page.locator('[data-testid="dimension-value-d"]').fill('$b');
  await expect(page.locator('[data-testid="dimension-variables-d"]')).toBeVisible();
  await expect(page.locator('[data-testid="dimension-variable-d-bust"]')).toContainText('Bust');
  await page.screenshot({
    path: '../.ai/runs/assets/2026-11-03-variables-and-expressions/05-variable-picker.png',
    fullPage: false,
  });
  await page.locator('[data-testid="dimension-variable-d-bust"]').click();
  await expect(page.locator('[data-testid="dimension-value-d"]')).toHaveValue('$bust');
  await page.locator('[data-testid="dimension-value-d"]').fill('$bust / 4');
  await page.locator('[data-testid="dimension-value-d"]').blur();

  // Deleting the source leaves the dimension on its last number, flagged broken.
  await page.locator('[data-testid="sidebar-tab-variables"]').click();
  await page.locator('[data-testid="variable-remove-bust"]').click();
  await page.locator('[data-testid="sidebar-tab-dimensions"]').click();
  await expect(page.locator('[data-testid="dimension-state-d"]')).toHaveText('Broken');
  await expect(page.locator('[data-testid="dimension-value-d"]')).toHaveValue('$bust / 4');
  await expect(page.locator('[data-testid="dimension-broken-d"]')).toContainText(
    'keeps its last value',
  );
  await page.screenshot({
    path: '../.ai/runs/assets/2026-11-03-variables-and-expressions/04-broken-formula.png',
    fullPage: false,
  });
});
