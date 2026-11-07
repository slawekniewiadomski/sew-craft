import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BarShell from '@/components/bars/BarShell.vue';

describe('BarShell', () => {
  it('renders the default strip chrome and its slot', () => {
    const wrapper = mount(BarShell, {
      slots: { default: '<span>content</span>' },
      attrs: { 'data-testid': 'bar' },
    });

    expect(wrapper.get('[data-testid="bar"]').classes()).toContain('gap-2');
    expect(wrapper.get('[data-testid="bar"]').classes()).toContain('px-2');
    expect(wrapper.text()).toBe('content');
  });

  it('uses the dense toolbar rhythm', () => {
    const wrapper = mount(BarShell, { props: { variant: 'dense' } });

    expect(wrapper.classes()).toContain('gap-x-3');
    expect(wrapper.classes()).toContain('px-3');
    expect(wrapper.classes()).not.toContain('gap-2');
  });
});
