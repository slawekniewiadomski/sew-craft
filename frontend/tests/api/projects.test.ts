import type { PatternDocument } from '@sewcraft/geometry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.resetModules();
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
    const { projectsApi } = await import('@/api/projects');

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
    const { projectsApi } = await import('@/api/projects');

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
    const { projectsApi } = await import('@/api/projects');

    await expect(projectsApi.remove(3)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/3',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('throws an ApiError carrying the server message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, 500));
    const { projectsApi, ApiError } = await import('@/api/projects');

    await expect(projectsApi.list()).rejects.toBeInstanceOf(ApiError);
    await expect(projectsApi.list()).rejects.toThrow('nope');
  });

  it('honours a configured API base URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://example.test/api');
    vi.resetModules();
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    const { projectsApi } = await import('@/api/projects');
    await projectsApi.list();

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/projects', expect.anything());
    vi.unstubAllEnvs();
  });

  it('fetches the pattern of a project', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          id: 7,
          project_id: 1,
          name: 'Summer dress',
          document: null,
          version: 0,
          saved_at: null,
        },
      }),
    );
    const { projectsApi } = await import('@/api/projects');

    const result = await projectsApi.getPattern(1);

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/1/pattern', expect.anything());
    expect(result.data.id).toBe(7);
    expect(result.data.document).toBeNull();
  });

  it('saves a pattern with its expected version and schema', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: { id: 7, version: 13, saved_at: '2026-10-23T16:02:44Z', created: true },
      }),
    );
    const { projectsApi } = await import('@/api/projects');
    const document: PatternDocument = {
      schema: 'sewcraft.pattern/0.5',
      units: 'mm',
      entities: [],
      constraints: [],
      pieces: [],
      assemblies: [],
      tabs: [],
    };

    const result = await projectsApi.savePattern(1, {
      document,
      expected_version: 12,
      expected_schema: 'sewcraft.pattern/0.1',
    });

    expect(result.data.version).toBe(13);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/1/pattern',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          document,
          expected_version: 12,
          expected_schema: 'sewcraft.pattern/0.1',
        }),
      }),
    );
  });

  it('keeps the documented conflict body on the ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          message: 'The project was saved by someone else.',
          current_version: 14,
          saved_at: '2026-10-23T16:05:00Z',
        },
        409,
      ),
    );
    const { projectsApi, ApiError } = await import('@/api/projects');

    const failure = projectsApi.savePattern(1, {
      document: {
        schema: 'sewcraft.pattern/0.5',
        units: 'mm',
        entities: [],
        constraints: [],
        pieces: [],
        assemblies: [],
        tabs: [],
      },
      expected_version: 12,
    });

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      status: 409,
      body: { current_version: 14 },
      message: 'The project was saved by someone else.',
    });
  });

  it('tolerates a non-JSON error body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });
    const { projectsApi } = await import('@/api/projects');

    await expect(projectsApi.list()).rejects.toThrow('Request failed with status 500');
  });
});
