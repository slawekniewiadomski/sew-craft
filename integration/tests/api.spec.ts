import { expect, test } from '@playwright/test';

import { getRuntime } from '../support/runtime';

const unique = (): string =>
  `Integration dress ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test('exposes the command spec', async ({ request }) => {
  const { appUrl } = getRuntime();

  const response = await request.get(`${appUrl}/api/commands`);

  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { version: string; commands: Record<string, unknown> };
  expect(body.version).toBe('0.1.0');
  expect(Object.keys(body.commands)).toContain('add_point');
});

test('creates, lists, updates and deletes a project over HTTP', async ({ request }) => {
  const { appUrl } = getRuntime();
  const name = unique();

  const created = await request.post(`${appUrl}/api/projects`, {
    data: { name, description: 'created by the integration suite' },
  });
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as { data: { id: number; name: string } };
  expect(createdBody.data.name).toBe(name);
  const id = createdBody.data.id;

  const listed = await request.get(`${appUrl}/api/projects`);
  const listBody = (await listed.json()) as { data: { id: number }[] };
  expect(listBody.data.map((project) => project.id)).toContain(id);

  const updated = await request.put(`${appUrl}/api/projects/${id}`, {
    data: { name: `${name} (edited)` },
  });
  expect(updated.ok()).toBe(true);

  const deleted = await request.delete(`${appUrl}/api/projects/${id}`);
  expect(deleted.status()).toBe(204);

  const missing = await request.get(`${appUrl}/api/projects/${id}`);
  expect(missing.status()).toBe(404);
});

test('rejects an invalid project payload', async ({ request }) => {
  const { appUrl } = getRuntime();

  const response = await request.post(`${appUrl}/api/projects`, { data: { name: '' } });

  expect(response.status()).toBe(422);
  const body = (await response.json()) as { errors: Record<string, unknown> };
  expect(body.errors).toHaveProperty('name');
});
