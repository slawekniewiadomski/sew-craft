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

describe('authApi', () => {
  it('registers, logs in, reads the account and logs out', async () => {
    const { authApi } = await import('@/api/auth');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { user: { id: 1 }, token: 'registered' } }, 201),
    );
    await expect(
      authApi.register({
        email: 'maker@example.com',
        password: 'correct-horse',
        password_confirmation: 'correct-horse',
      }),
    ).resolves.toMatchObject({ data: { token: 'registered' } });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/register', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'maker@example.com',
        password: 'correct-horse',
        password_confirmation: 'correct-horse',
      }),
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { user: { id: 1 }, token: 'logged-in' } }),
    );
    await expect(
      authApi.login({ email: 'maker@example.com', password: 'correct-horse' }),
    ).resolves.toMatchObject({ data: { token: 'logged-in' } });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/login', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'maker@example.com', password: 'correct-horse' }),
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 1, email: 'maker@example.com' } }));
    await expect(authApi.user()).resolves.toMatchObject({ data: { id: 1 } });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/user', expect.any(Object));

    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: async () => undefined });
    await expect(authApi.logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/logout', expect.any(Object));
  });
});
