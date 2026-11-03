import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import Separator from '@/components/ui/separator/Separator.vue';

enableAutoUnmount(afterEach);

describe('Separator', () => {
  it('renders a decorative horizontal rule by default', () => {
    const wrapper = mount(Separator);

    expect(wrapper.attributes('role')).toBe('none');
    expect(wrapper.classes()).toContain('h-px');
    expect(wrapper.classes()).toContain('w-full');
  });

  it('exposes the separator semantics when not decorative', () => {
    const wrapper = mount(Separator, { props: { decorative: false } });

    expect(wrapper.attributes('role')).toBe('separator');
  });

  it('renders a vertical rule when asked', () => {
    const wrapper = mount(Separator, { props: { orientation: 'vertical' } });

    expect(wrapper.classes()).toContain('w-px');
    expect(wrapper.classes()).toContain('h-full');
  });

  it('merges a custom class', () => {
    const wrapper = mount(Separator, { props: { class: 'mx-1' } });

    expect(wrapper.classes()).toContain('mx-1');
  });
});
