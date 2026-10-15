import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { describe, expect, it } from 'vitest';

import App from './App.vue';

const Stub = { template: '<div />' };

async function makeRouter(path: string): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/projects' },
      { path: '/projects', name: 'projects', component: Stub },
      { path: '/projects/:id/edit', name: 'editor', component: Stub, props: true },
    ],
  });
  await router.push(path);
  await router.isReady();
  return router;
}

describe('App', () => {
  it('renders the navigation shell and active route', async () => {
    const router = await makeRouter('/projects');
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('SewCraft');
    expect(wrapper.text()).toContain('Projects');
    expect(wrapper.text()).toContain('2D sewing pattern drafting.');
    expect(wrapper.findComponent(Stub).exists()).toBe(true);
  });

  it('hides the footer on the editor route', async () => {
    const router = await makeRouter('/projects/1/edit');
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('SewCraft');
    expect(wrapper.text()).not.toContain('2D sewing pattern drafting.');
  });
});
