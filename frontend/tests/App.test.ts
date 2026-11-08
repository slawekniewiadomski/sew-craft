import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/api/auth';
import { writeAuthToken } from '@/api/client';
import App from '@/App.vue';

vi.mock('@/api/auth', () => ({
  authApi: { register: vi.fn(), login: vi.fn(), logout: vi.fn(), user: vi.fn() },
}));

const logoutMock = vi.mocked(authApi.logout);
const userMock = vi.mocked(authApi.user);

const Stub = { template: '<div />' };
const user = { id: 1, name: 'maker', email: 'maker@example.com', created_at: '' };

async function makeRouter(path: string): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/projects' },
      { path: '/login', name: 'login', component: Stub },
      { path: '/projects', name: 'projects', component: Stub },
      { path: '/projects/:id/edit', name: 'editor', component: Stub, props: true },
    ],
  });
  await router.push(path);
  await router.isReady();
  return router;
}

beforeEach(() => {
  window.localStorage.clear();
  logoutMock.mockReset();
  userMock.mockReset();
});

describe('App', () => {
  it('renders the navigation shell and active route', async () => {
    const router = await makeRouter('/projects');
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });
    await flushPromises();

    expect(wrapper.find('header').exists()).toBe(true);
    expect(wrapper.text()).toContain('SewCraft');
    expect(wrapper.text()).toContain('Projects');
    expect(wrapper.text()).toContain('2D sewing pattern drafting.');
    expect(wrapper.findComponent(Stub).exists()).toBe(true);
  });

  it('hides the app header and footer on the editor route', async () => {
    const router = await makeRouter('/projects/1/edit');
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });
    await flushPromises();

    // The editor renders its own top bar, so the shell contributes no header.
    expect(wrapper.find('header').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('SewCraft');
    expect(wrapper.text()).not.toContain('2D sewing pattern drafting.');
    expect(wrapper.findComponent(Stub).exists()).toBe(true);
  });

  it('shows the signed-in account and logs out', async () => {
    writeAuthToken('secret');
    userMock.mockResolvedValue({ data: user });
    logoutMock.mockResolvedValue(undefined);
    const router = await makeRouter('/projects');
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="account-menu"]').text()).toContain('maker@example.com');

    await wrapper.find('[data-testid="auth-logout"]').trigger('click');
    await flushPromises();

    expect(logoutMock).toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('login');
    expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false);
  });
});
