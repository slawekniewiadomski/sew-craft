import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/api/auth';
import RegisterView from '@/views/RegisterView.vue';

vi.mock('@/api/auth', () => ({
  authApi: { register: vi.fn(), login: vi.fn(), logout: vi.fn(), user: vi.fn() },
}));

const registerMock = vi.mocked(authApi.register);
const Stub = { template: '<div />' };

const user = { id: 1, name: 'maker', email: 'maker@example.com', created_at: '' };

async function mountView(): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: Stub },
      { path: '/register', name: 'register', component: RegisterView },
      { path: '/projects', name: 'projects', component: Stub },
    ],
  });
  await router.push('/register');
  await router.isReady();
  const wrapper = mount(RegisterView, { global: { plugins: [createPinia(), router] } });
  return { wrapper, router };
}

beforeEach(() => {
  window.localStorage.clear();
  registerMock.mockReset();
});

describe('RegisterView', () => {
  it('creates the account and opens the projects list', async () => {
    registerMock.mockResolvedValue({ data: { user, token: 'token' } });
    const { wrapper, router } = await mountView();

    await wrapper.find('[data-testid="auth-email"]').setValue('maker@example.com');
    await wrapper.find('[data-testid="auth-password"]').setValue('correct-horse');
    await wrapper.find('[data-testid="auth-password-confirmation"]').setValue('correct-horse');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(registerMock).toHaveBeenCalledWith({
      email: 'maker@example.com',
      password: 'correct-horse',
      password_confirmation: 'correct-horse',
    });
    expect(router.currentRoute.value.name).toBe('projects');
  });

  it('shows a registration error', async () => {
    registerMock.mockRejectedValue(new Error('The email has already been taken.'));
    const { wrapper } = await mountView();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="auth-error"]').text()).toBe(
      'The email has already been taken.',
    );
  });
});
