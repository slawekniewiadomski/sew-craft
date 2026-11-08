import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/api/auth';
import { writeAuthToken } from '@/api/client';
import { router } from '@/router/index';

vi.mock('@/api/auth', () => ({
  authApi: { register: vi.fn(), login: vi.fn(), logout: vi.fn(), user: vi.fn() },
}));

const userMock = vi.mocked(authApi.user);
const user = { id: 1, name: 'maker', email: 'maker@example.com', created_at: '' };

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
  userMock.mockReset();
});

describe('router', () => {
  it('defines the auth, projects and editor routes', () => {
    const names = router.getRoutes().map((route) => route.name);

    expect(names).toContain('login');
    expect(names).toContain('register');
    expect(names).toContain('projects');
    expect(names).toContain('editor');
  });

  it('redirects the root path to projects', () => {
    const resolved = router.resolve('/');

    expect(resolved.matched[0]?.redirect).toBe('/projects');
  });

  it('resolves the editor route with its id param', () => {
    const resolved = router.resolve('/projects/7/edit');

    expect(resolved.name).toBe('editor');
    expect(resolved.params.id).toBe('7');
  });
});

describe('auth guard', () => {
  it('sends a signed-out visitor to login with the target', async () => {
    await router.push('/projects/7/edit?guard=1');

    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.redirect).toBe('/projects/7/edit?guard=1');
  });

  it('lets a signed-in account through and off the auth screens', async () => {
    writeAuthToken('secret');
    userMock.mockResolvedValue({ data: user });

    await router.push('/projects?guard=2');
    expect(router.currentRoute.value.name).toBe('projects');

    await router.push('/login?guard=3');
    expect(router.currentRoute.value.name).toBe('projects');
  });

  it('treats a rejected token as signed out', async () => {
    writeAuthToken('stale');
    userMock.mockRejectedValue(new Error('401'));

    await router.push('/projects?guard=4');

    expect(router.currentRoute.value.name).toBe('login');
  });
});
