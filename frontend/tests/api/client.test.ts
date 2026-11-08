import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_TOKEN_KEY, ApiError, readAuthToken, request, writeAuthToken } from '@/api/client';

const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
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

describe('auth token storage', () => {
  it('stores, reads and clears the token', () => {
    expect(readAuthToken()).toBeNull();

    writeAuthToken('secret');
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe('secret');
    expect(readAuthToken()).toBe('secret');

    writeAuthToken(null);
    expect(readAuthToken()).toBeNull();
  });
});

describe('request', () => {
  it('adds the bearer token when signed in', async () => {
    writeAuthToken('secret');
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await request('/projects');

    expect(fetchMock).toHaveBeenCalledWith('/api/projects', {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret',
      },
    });
  });

  it('sends no authorization header when signed out', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await request('/projects');

    expect(fetchMock.mock.calls[0]![1].headers).not.toHaveProperty('Authorization');
  });

  it('keeps caller headers alongside the defaults', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await request('/projects', { headers: { 'X-Trace': 'abc' } });

    expect(fetchMock.mock.calls[0]![1].headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Trace': 'abc',
    });
  });

  it('returns undefined for a 204 response', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => undefined });

    await expect(request('/projects/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws an ApiError with a parsed body, or a status fallback', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'nope' }, 500));
    await expect(request('/projects')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'nope',
      status: 500,
    });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(request('/projects')).rejects.toThrow('Request failed with status 502');
  });
});
