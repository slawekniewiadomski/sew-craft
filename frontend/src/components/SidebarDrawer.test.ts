import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import SidebarDrawer from './SidebarDrawer.vue';

enableAutoUnmount(afterEach);

function mountDrawer(open: boolean) {
  return mount(SidebarDrawer, {
    props: { id: 'view', label: 'View', open },
    slots: { default: '<p data-testid="drawer-body">Body</p>' },
  });
}

describe('SidebarDrawer', () => {
  it('renders an open drawer with its content and collapse marker', () => {
    const wrapper = mountDrawer(true);

    expect(wrapper.find('[data-testid="drawer-toggle-view"]').text()).toContain('View');
    expect(wrapper.find('[data-testid="drawer-toggle-view"]').text()).toContain('▾');
    expect(wrapper.find('[data-testid="drawer-content-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawer-body"]').exists()).toBe(true);
  });

  it('hides the content and shows an expand marker when collapsed', () => {
    const wrapper = mountDrawer(false);

    expect(wrapper.find('[data-testid="drawer-toggle-view"]').text()).toContain('▸');
    expect(wrapper.find('[data-testid="drawer-content-view"]').exists()).toBe(false);
  });

  it('emits update:open when the trigger is clicked', async () => {
    const wrapper = mountDrawer(false);

    await wrapper.find('[data-testid="drawer-toggle-view"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('update:open')).toEqual([[true]]);
  });
});
