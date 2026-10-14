import { expect, test } from '@playwright/test';

import { getRuntime } from '../support/runtime';

test('creates a project through the SPA and shows it in the list', async ({ page }) => {
  const { previewUrl } = getRuntime();
  const name = `UI dress ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.goto(previewUrl);
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

  await page.getByPlaceholder('New project name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByPlaceholder('New project name')).toHaveValue('');
});

test('opens the editor for a project', async ({ page }) => {
  const { previewUrl } = getRuntime();
  const name = `Editor dress ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.goto(previewUrl);
  await page.getByPlaceholder('New project name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(name)).toBeVisible();

  const row = page.locator('li', { hasText: name });
  await row.getByRole('button', { name: 'Open' }).click();

  await expect(page).toHaveURL(/\/projects\/\d+\/edit$/);
  await expect(page.getByText(/command\(s\)/)).toBeVisible();
});
