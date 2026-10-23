import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SidebarStat from './SidebarStat.vue';

describe('SidebarStat', () => {
  it('renders one muted status line from its slot', () => {
    const wrapper = mount(SidebarStat, {
      slots: { default: '<span data-testid="tool">Select</span>' },
      attrs: { 'data-testid': 'workspace-summary' },
    });

    expect(wrapper.attributes('data-testid')).toBe('workspace-summary');
    expect(wrapper.find('[data-testid="tool"]').text()).toBe('Select');
    expect(wrapper.classes()).toContain('text-2xs');
    expect(wrapper.classes()).toContain('border-t');
  });
});
