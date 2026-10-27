import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';

describe('SidebarEmpty', () => {
  it('renders a message on its own', () => {
    const wrapper = mount(SidebarEmpty, { props: { message: 'No pieces yet.' } });

    expect(wrapper.text()).toBe('No pieces yet.');
    expect(wrapper.find('svg').exists()).toBe(false);
  });

  it('adds an optional hint and icon', () => {
    const wrapper = mount(SidebarEmpty, {
      props: { message: 'Nothing selected', hint: 'Select an entity.', icon: 'select' },
    });

    expect(wrapper.text()).toContain('Nothing selected');
    expect(wrapper.text()).toContain('Select an entity.');
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('renders an optional action slot', () => {
    const wrapper = mount(SidebarEmpty, {
      props: { message: 'Nothing selected' },
      slots: { action: '<button data-testid="empty-action">Select</button>' },
    });

    expect(wrapper.find('[data-testid="empty-action"]').exists()).toBe(true);
  });
});
