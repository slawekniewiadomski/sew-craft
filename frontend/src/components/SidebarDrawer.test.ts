import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import SidebarDrawer from './SidebarDrawer.vue';

enableAutoUnmount(afterEach);

function mountDrawer(open: boolean, count?: number) {
  return mount(SidebarDrawer, {
    props: { id: 'view', label: 'View', open, ...(count === undefined ? {} : { count }) },
    slots: { default: '<p data-testid="drawer-body">Body</p>' },
  });
}

describe('SidebarDrawer', () => {
  it('renders an open drawer with its content, count and rotated chevron', () => {
    const wrapper = mountDrawer(true, 4);
    const trigger = wrapper.find('[data-testid="drawer-toggle-view"]');

    expect(trigger.text()).toContain('View');
    expect(trigger.find('[data-testid="drawer-chevron-view"]').classes()).toContain('rotate-90');
    expect(wrapper.find('[data-testid="drawer-count"]').text()).toBe('4');
    expect(wrapper.find('[data-testid="drawer-content-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawer-body"]').exists()).toBe(true);
    expect(trigger.classes()).toContain('sticky');
  });

  it('hides the content and points the chevron right when collapsed', () => {
    const wrapper = mountDrawer(false);

    expect(wrapper.find('[data-testid="drawer-chevron-view"]').classes()).not.toContain(
      'rotate-90',
    );
    expect(wrapper.find('[data-testid="drawer-content-view"]').exists()).toBe(false);
  });

  it('renders no count badge at zero', () => {
    expect(mountDrawer(true, 0).find('[data-testid="drawer-count"]').exists()).toBe(false);
  });

  it('emits update:open when the trigger is clicked', async () => {
    const wrapper = mountDrawer(false);

    await wrapper.find('[data-testid="drawer-toggle-view"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('update:open')).toEqual([[true]]);
  });
});
