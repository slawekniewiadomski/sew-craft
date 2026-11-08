import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/api/auth';
import { readAuthToken, writeAuthToken } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/api/auth', () => ({
  authApi: { register: vi.fn(), login: vi.fn(), logout: vi.fn(), user: vi.fn() },
}));

const loginMock = vi.mocked(authApi.login);
const registerMock = vi.mocked(authApi.register);
const logoutMock = vi.mocked(authApi.logout);
const userMock = vi.mocked(authApi.user);

const user = { id: 1, name: 'maker', email: 'maker@example.com', created_at: '' };

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
  loginMock.mockReset();
  registerMock.mockReset();
  logoutMock.mockReset();
  userMock.mockReset();
});

describe('auth store', () => {
  it('finishes the boot check without a token', async () => {
    const store = useAuthStore();

    await store.restore();

    expect(store.loaded).toBe(true);
    expect(store.isAuthenticated).toBe(false);
    expect(userMock).not.toHaveBeenCalled();
  });

  it('restores the account behind a stored token', async () => {
    writeAuthToken('secret');
    userMock.mockResolvedValue({ data: user });
    const store = useAuthStore();

    await store.restore();

    expect(store.user).toEqual(user);
    expect(store.isAuthenticated).toBe(true);
    expect(store.loaded).toBe(true);
  });

  it('clears a rejected stored token', async () => {
    writeAuthToken('stale');
    userMock.mockRejectedValue(new Error('401'));
    const store = useAuthStore();

    await store.restore();

    expect(store.user).toBeNull();
    expect(readAuthToken()).toBeNull();
    expect(store.loaded).toBe(true);
  });

  it('checks the token only once', async () => {
    writeAuthToken('secret');
    userMock.mockResolvedValue({ data: user });
    const store = useAuthStore();

    await store.restore();
    await store.restore();

    expect(userMock).toHaveBeenCalledTimes(1);
  });

  it('logs in and stores the token and account', async () => {
    loginMock.mockResolvedValue({ data: { user, token: 'fresh' } });
    const store = useAuthStore();

    await expect(store.login('maker@example.com', 'correct-horse')).resolves.toBe(true);

    expect(readAuthToken()).toBe('fresh');
    expect(store.user).toEqual(user);
    expect(store.loaded).toBe(true);
    expect(store.error).toBeNull();
    expect(store.busy).toBe(false);
  });

  it('reports a login failure', async () => {
    loginMock.mockRejectedValue(new Error('These credentials do not match our records.'));
    const store = useAuthStore();

    await expect(store.login('maker@example.com', 'wrong')).resolves.toBe(false);

    expect(store.error).toBe('These credentials do not match our records.');
    expect(store.user).toBeNull();
    expect(store.busy).toBe(false);
  });

  it('falls back for a non-Error login failure', async () => {
    loginMock.mockRejectedValue('nope');
    const store = useAuthStore();

    await store.login('maker@example.com', 'wrong');

    expect(store.error).toBe('Could not sign in');
  });

  it('registers and stores the new session', async () => {
    registerMock.mockResolvedValue({ data: { user, token: 'new-account' } });
    const store = useAuthStore();

    await expect(
      store.register('maker@example.com', 'correct-horse', 'correct-horse'),
    ).resolves.toBe(true);

    expect(registerMock).toHaveBeenCalledWith({
      email: 'maker@example.com',
      password: 'correct-horse',
      password_confirmation: 'correct-horse',
    });
    expect(readAuthToken()).toBe('new-account');
    expect(store.user).toEqual(user);
  });

  it('reports a registration failure', async () => {
    registerMock.mockRejectedValue(new Error('The email has already been taken.'));
    const store = useAuthStore();

    await expect(
      store.register('maker@example.com', 'correct-horse', 'correct-horse'),
    ).resolves.toBe(false);
    expect(store.error).toBe('The email has already been taken.');

    registerMock.mockRejectedValue('nope');
    await store.register('maker@example.com', 'correct-horse', 'correct-horse');
    expect(store.error).toBe('Could not create the account');
  });

  it('logs out locally even when the server revoke fails', async () => {
    writeAuthToken('secret');
    loginMock.mockResolvedValue({ data: { user, token: 'secret' } });
    const store = useAuthStore();
    await store.login('maker@example.com', 'correct-horse');

    logoutMock.mockResolvedValueOnce(undefined);
    await store.logout();
    expect(readAuthToken()).toBeNull();
    expect(store.user).toBeNull();
    expect(store.loaded).toBe(true);

    writeAuthToken('secret');
    logoutMock.mockRejectedValueOnce(new Error('offline'));
    await store.logout();
    expect(readAuthToken()).toBeNull();
    expect(store.user).toBeNull();
    expect(store.busy).toBe(false);
  });
});
