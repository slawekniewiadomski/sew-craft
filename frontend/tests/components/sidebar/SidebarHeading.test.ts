import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SidebarHeading from '@/components/sidebar/SidebarHeading.vue';

describe('SidebarHeading', () => {
  it('renders a section heading without a badge', () => {
    const wrapper = mount(SidebarHeading, { props: { label: 'Geometry' } });

    expect(wrapper.element.tagName).toBe('H3');
    expect(wrapper.text()).toContain('Geometry');
    expect(wrapper.find('[data-testid="heading-count"]').exists()).toBe(false);
  });

  it('shows an optional count badge and forwards its id', () => {
    const wrapper = mount(SidebarHeading, {
      props: { label: 'Dimensions', count: 3 },
      attrs: { id: 'dimensions-heading' },
    });

    expect(wrapper.attributes('id')).toBe('dimensions-heading');
    expect(wrapper.find('[data-testid="heading-count"]').text()).toBe('3');
  });

  it('hides the badge for a zero count', () => {
    expect(
      mount(SidebarHeading, { props: { label: 'View', count: 0 } })
        .find('[data-testid="heading-count"]')
        .exists(),
    ).toBe(false);
  });
});
