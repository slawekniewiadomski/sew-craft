import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SidebarInput from './SidebarInput.vue';

describe('SidebarInput', () => {
  it('renders the shared field chrome and forwards attributes', () => {
    const wrapper = mount(SidebarInput, {
      attrs: { value: 'Piece 1', 'data-testid': 'name', 'aria-label': 'Name' },
    });

    expect(wrapper.element.tagName).toBe('INPUT');
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['h-7', 'w-40', 'rounded-sm', 'border', 'text-xs']),
    );
    expect(wrapper.attributes('data-testid')).toBe('name');
    expect((wrapper.element as HTMLInputElement).value).toBe('Piece 1');
  });

  it('lets a caller set the width', () => {
    const wrapper = mount(SidebarInput, { props: { class: 'w-20 tabular-nums' } });

    expect(wrapper.classes()).toContain('w-20');
    expect(wrapper.classes()).not.toContain('w-40');
  });
});
