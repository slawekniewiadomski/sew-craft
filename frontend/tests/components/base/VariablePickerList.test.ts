import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import VariablePickerList from '@/components/base/VariablePickerList.vue';

const options = [
  { slug: 'bust', name: 'Bust', resolved: '880 mm' },
  { slug: 'waist', name: 'Waist', resolved: '720 mm' },
];

describe('VariablePickerList', () => {
  it('renders each variable and emits the picked slug', async () => {
    const wrapper = mount(VariablePickerList, {
      props: {
        options,
        label: 'Variables for dimension d1',
        listTestId: 'dimension-variables-d1',
        optionTestIdPrefix: 'dimension-variable-d1',
        listId: 'dimension-variable-list',
      },
    });

    expect(wrapper.attributes('id')).toBe('dimension-variable-list');
    expect(wrapper.attributes('aria-label')).toBe('Variables for dimension d1');
    expect(wrapper.findAll('li')).toHaveLength(2);
    expect(wrapper.get('[data-testid="dimension-variable-d1-bust"]').text()).toContain('Bust');

    await wrapper.get('[data-testid="dimension-variable-d1-waist"]').trigger('mousedown');

    expect(wrapper.emitted('pick')).toEqual([['waist']]);
  });

  it('renders nothing without options', () => {
    const wrapper = mount(VariablePickerList, {
      props: {
        options: [],
        label: 'Variables',
        listTestId: 'variables',
        optionTestIdPrefix: 'variable',
      },
    });

    expect(wrapper.find('ul').exists()).toBe(false);
  });

  it('uses the canvas scale over the drawing', () => {
    const wrapper = mount(VariablePickerList, {
      props: {
        options,
        label: 'Variables',
        listTestId: 'variables',
        optionTestIdPrefix: 'variable',
        size: 'canvas',
      },
    });

    expect(wrapper.classes()).toContain('w-44');
    expect(wrapper.classes()).not.toContain('w-56');
  });
});
