import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('projectsApi', () => {
  it('lists projects', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 1, name: 'Dress' }] }));
    const { projectsApi } = await import('./projects');

    const result = await projectsApi.list();

    expect(result.data[0]?.name).toBe('Dress');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      }),
    );
  });

  it('creates a project', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: 2, name: 'Bodice' } }, 201));
    const { projectsApi } = await import('./projects');

    const result = await projectsApi.create({ name: 'Bodice', description: 'top' });

    expect(result.data.id).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Bodice', description: 'top' }),
      }),
    );
  });

  it('removes a project and tolerates an empty 204 body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => undefined });
    const { projectsApi } = await import('./projects');

    await expect(projectsApi.remove(3)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/3',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('throws on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, 500));
    const { projectsApi } = await import('./projects');

    await expect(projectsApi.list()).rejects.toThrow('Request failed with status 500');
  });

  it('honours a configured API base URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://example.test/api');
    vi.resetModules();
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    const { projectsApi } = await import('./projects');
    await projectsApi.list();

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/projects', expect.anything());
    vi.unstubAllEnvs();
  });
});
