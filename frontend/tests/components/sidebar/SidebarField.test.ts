import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SidebarField from '@/components/sidebar/SidebarField.vue';

function mountField(mono: boolean) {
  return mount(SidebarField, {
    props: { label: 'Length', mono },
    slots: { default: '100 mm' },
    attrs: { 'data-testid': 'field-value' },
  });
}

describe('SidebarField', () => {
  it('renders a dt/dd pair with a scannable value', () => {
    const wrapper = mountField(false);
    const value = wrapper.find('dd');

    expect(wrapper.find('dt').text()).toBe('Length');
    expect(value.text()).toBe('100 mm');
    expect(value.attributes('data-testid')).toBe('field-value');
    expect(value.classes()).toContain('text-[13px]');
    expect(value.classes()).toContain('tabular-nums');
  });

  it('renders trailing mono metadata at the smaller step', () => {
    const value = mountField(true).find('dd');

    expect(value.classes()).toContain('font-mono');
    expect(value.classes()).toContain('text-2xs');
    expect(value.classes()).toContain('text-muted-foreground');
  });
});
