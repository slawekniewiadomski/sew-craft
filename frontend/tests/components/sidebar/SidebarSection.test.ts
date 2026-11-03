import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SidebarSection from '@/components/sidebar/SidebarSection.vue';

describe('SidebarSection', () => {
  it('renders a labelled section with its content', () => {
    const wrapper = mount(SidebarSection, {
      props: { label: 'Geometry', headingId: 'geometry-heading' },
      slots: { default: '<p data-testid="body">Body</p>' },
    });

    expect(wrapper.find('h3').attributes('id')).toBe('geometry-heading');
    expect(wrapper.find('h3').text()).toContain('Geometry');
    expect(wrapper.find('[data-testid="body"]').text()).toBe('Body');
    expect(wrapper.classes()).toContain('border-t');
  });

  it('shows a count badge and a row action', () => {
    const wrapper = mount(SidebarSection, {
      props: { label: 'Dimensions', count: 2 },
      slots: { action: '<button data-testid="remove">x</button>' },
    });

    expect(wrapper.find('h3').text()).toContain('Dimensions');
    expect(wrapper.find('[data-testid="heading-count"]').text()).toBe('2');
    expect(wrapper.find('[data-testid="remove"]').exists()).toBe(true);
  });
});
