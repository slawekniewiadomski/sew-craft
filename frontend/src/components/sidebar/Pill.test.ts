import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import Pill from './Pill.vue';

describe('Pill', () => {
  it('defaults to the neutral tone', () => {
    const wrapper = mount(Pill, { slots: { default: 'Construction' } });

    expect(wrapper.text()).toBe('Construction');
    expect(wrapper.classes()).toContain('text-muted-foreground');
  });

  it('renders the accent tone for allowance widths', () => {
    expect(
      mount(Pill, { props: { tone: 'accent' }, slots: { default: '10 mm' } }).classes(),
    ).toContain('bg-primary/10');
  });

  it('renders the danger tone for broken dimensions', () => {
    expect(
      mount(Pill, { props: { tone: 'danger' }, slots: { default: 'Broken' } }).classes(),
    ).toContain('text-destructive');
  });
});
