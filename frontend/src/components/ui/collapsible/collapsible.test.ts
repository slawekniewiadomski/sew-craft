import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './index';

enableAutoUnmount(afterEach);

const Host = {
  components: { Collapsible, CollapsibleContent, CollapsibleTrigger },
  props: { defaultOpen: { type: Boolean, default: false } },
  template: `
    <Collapsible :default-open="defaultOpen">
      <CollapsibleTrigger>Toggle</CollapsibleTrigger>
      <CollapsibleContent><p>Panel</p></CollapsibleContent>
    </Collapsible>
  `,
};

describe('Collapsible', () => {
  it('renders the trigger and hides the panel when closed', () => {
    const wrapper = mount(Host);

    expect(wrapper.text()).toContain('Toggle');
    expect(wrapper.text()).not.toContain('Panel');
  });

  it('renders the panel when open', () => {
    const wrapper = mount(Host, { props: { defaultOpen: true } });

    expect(wrapper.text()).toContain('Panel');
  });

  it('opens the panel when the trigger is clicked', async () => {
    const wrapper = mount(Host);

    await wrapper.find('button').trigger('click');
    await nextTick();

    expect(wrapper.text()).toContain('Panel');
  });
});
