import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SidebarButton from '@/components/sidebar/SidebarButton.vue';

describe('SidebarButton', () => {
  it('renders an inline button with its chrome and label', () => {
    const wrapper = mount(SidebarButton, {
      attrs: { 'data-testid': 'apply', disabled: true },
      slots: { default: 'Apply' },
    });

    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['h-7', 'rounded-sm', 'border']));
    expect(wrapper.text()).toBe('Apply');
    expect(wrapper.attributes('data-testid')).toBe('apply');
    expect(wrapper.attributes('disabled')).toBeDefined();
  });

  it('lets a caller adjust the chrome', () => {
    const wrapper = mount(SidebarButton, { props: { class: 'px-3' } });

    expect(wrapper.classes()).toContain('px-3');
    expect(wrapper.classes()).not.toContain('px-2');
  });
});
