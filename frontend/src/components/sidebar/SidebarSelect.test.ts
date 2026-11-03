import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SidebarSelect from './SidebarSelect.vue';

describe('SidebarSelect', () => {
  it('renders the shared picker chrome with its options', () => {
    const wrapper = mount(SidebarSelect, {
      attrs: { value: 'cut', 'data-testid': 'role' },
      slots: {
        default: '<option value="cut">Cut</option><option value="annotation">Note</option>',
      },
    });

    expect(wrapper.element.tagName).toBe('SELECT');
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['h-7', 'rounded-sm', 'border', 'text-xs']),
    );
    expect(wrapper.findAll('option')).toHaveLength(2);
    expect((wrapper.element as HTMLSelectElement).value).toBe('cut');
  });

  it('lets a caller set the width', () => {
    const wrapper = mount(SidebarSelect, { props: { class: 'w-24' } });

    expect(wrapper.classes()).toContain('w-24');
  });
});
