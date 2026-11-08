import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/api/auth';
import LoginView from '@/views/LoginView.vue';

vi.mock('@/api/auth', () => ({
  authApi: { register: vi.fn(), login: vi.fn(), logout: vi.fn(), user: vi.fn() },
}));

const loginMock = vi.mocked(authApi.login);
const Stub = { template: '<div />' };

const user = { id: 1, name: 'maker', email: 'maker@example.com', created_at: '' };

async function mountView(
  path = '/login',
): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/register', name: 'register', component: Stub },
      { path: '/projects', name: 'projects', component: Stub },
      { path: '/projects/:id/edit', name: 'editor', component: Stub },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(LoginView, { global: { plugins: [createPinia(), router] } });
  return { wrapper, router };
}

beforeEach(() => {
  window.localStorage.clear();
  loginMock.mockReset();
});

describe('LoginView', () => {
  it('signs in and opens the projects list', async () => {
    loginMock.mockResolvedValue({ data: { user, token: 'token' } });
    const { wrapper, router } = await mountView();

    await wrapper.find('[data-testid="auth-email"]').setValue('maker@example.com');
    await wrapper.find('[data-testid="auth-password"]').setValue('correct-horse');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(loginMock).toHaveBeenCalledWith({
      email: 'maker@example.com',
      password: 'correct-horse',
    });
    expect(router.currentRoute.value.name).toBe('projects');
  });

  it('returns to a safe redirect target', async () => {
    loginMock.mockResolvedValue({ data: { user, token: 'token' } });
    const { wrapper, router } = await mountView('/login?redirect=/projects/7/edit');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/projects/7/edit');
  });

  it('ignores an unsafe redirect target', async () => {
    loginMock.mockResolvedValue({ data: { user, token: 'token' } });
    const { wrapper, router } = await mountView('/login?redirect=//evil.example');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('projects');
  });

  it('shows the sign-in error', async () => {
    loginMock.mockRejectedValue(new Error('These credentials do not match our records.'));
    const { wrapper } = await mountView();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="auth-error"]').text()).toBe(
      'These credentials do not match our records.',
    );
  });
});
