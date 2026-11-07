import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import DialogHeader from '@/components/base/DialogHeader.vue';

describe('DialogHeader', () => {
  it('renders the title and a description slot', () => {
    const wrapper = mount(DialogHeader, {
      props: { titleId: 'title', title: 'Settings', descriptionId: 'body' },
      slots: { default: 'Explains the dialog.' },
    });

    expect(wrapper.get('h2').attributes('id')).toBe('title');
    expect(wrapper.get('h2').text()).toBe('Settings');
    expect(wrapper.get('p').attributes('id')).toBe('body');
    expect(wrapper.get('p').text()).toBe('Explains the dialog.');
  });

  it('omits the description when the slot is empty', () => {
    const wrapper = mount(DialogHeader, {
      props: { titleId: 'title', title: 'Settings' },
    });

    expect(wrapper.find('p').exists()).toBe(false);
  });

  it('exposes an optional title test id', () => {
    const wrapper = mount(DialogHeader, {
      props: { titleId: 'title', title: 'Settings', titleTestId: 'dialog-title' },
    });

    expect(wrapper.get('h2').attributes('data-testid')).toBe('dialog-title');
  });
});
