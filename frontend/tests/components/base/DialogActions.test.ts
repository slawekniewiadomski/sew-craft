import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import DialogActions from '@/components/base/DialogActions.vue';

describe('DialogActions', () => {
  it('renders a right-aligned action row', () => {
    const wrapper = mount(DialogActions, {
      slots: { default: '<button>Save</button>' },
    });

    expect(wrapper.classes()).toContain('justify-end');
    expect(wrapper.find('button').text()).toBe('Save');
    expect(wrapper.classes()).not.toContain('border-t');
  });

  it('adds the dividing rule when bordered', () => {
    const wrapper = mount(DialogActions, { props: { bordered: true } });

    expect(wrapper.classes()).toContain('border-t');
    expect(wrapper.classes()).toContain('pt-3');
  });
});
