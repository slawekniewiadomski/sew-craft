import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './index';

enableAutoUnmount(afterEach);

beforeEach(() => {
  document.body.innerHTML = '';
});

const Host = defineComponent({
  components: {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
  },
  props: {
    open: { type: Boolean, default: false },
    modelValue: { type: String, default: 'a' },
  },
  emits: ['update:open', 'update:modelValue'],
  template: `
    <DropdownMenu :open="open" :modal="false" @update:open="$emit('update:open', $event)">
      <DropdownMenuTrigger>Modes</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          :model-value="modelValue"
          @update:model-value="$emit('update:modelValue', $event)"
        >
          <DropdownMenuRadioItem value="a">Alpha</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="b">Beta</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  `,
});

async function mountHost(open = false, modelValue = 'a') {
  const wrapper = mount(Host, { props: { open, modelValue }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

function menuItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
}

describe('DropdownMenu', () => {
  it('renders the trigger inside the root', async () => {
    const wrapper = await mountHost();

    expect(wrapper.text()).toContain('Modes');
  });

  it('does not render the menu while closed', async () => {
    await mountHost();

    expect(document.body.textContent).not.toContain('Alpha');
  });

  it('renders portalled radio items with the selected one checked', async () => {
    await mountHost(true);

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual(['Alpha', 'Beta']);
    expect(menuItems()[0]!.getAttribute('aria-checked')).toBe('true');
    expect(menuItems()[1]!.getAttribute('aria-checked')).toBe('false');
  });

  it('emits the chosen value when a radio item is selected', async () => {
    const wrapper = await mountHost(true);

    menuItems()[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toEqual([['b']]);
  });
});
