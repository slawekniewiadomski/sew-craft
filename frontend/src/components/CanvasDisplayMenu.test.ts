import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import CanvasDisplayMenu from './CanvasDisplayMenu.vue';

enableAutoUnmount(afterEach);

beforeEach(() => {
  document.body.innerHTML = '';
});

const items = [
  { key: 'construction', label: 'Construction' },
  { key: 'allowances', label: 'Allowances' },
];

async function mountMenu(values: Record<string, boolean> = { construction: true }) {
  const wrapper = mount(CanvasDisplayMenu, {
    props: { items, values },
    attachTo: document.body,
  });
  await wrapper.find('[data-testid="display-menu-trigger"]').trigger('click');
  await flushPromises();
  return wrapper;
}

function menuItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')];
}

describe('CanvasDisplayMenu', () => {
  it('labels the icon trigger for hover and assistive tech', () => {
    const wrapper = mount(CanvasDisplayMenu, { props: { items, values: {} } });

    expect(wrapper.find('[data-testid="display-menu-trigger"]').attributes('aria-label')).toBe(
      'Display settings',
    );
  });

  it('lists one checked row per layer when opened', async () => {
    await mountMenu();

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual([
      'Construction',
      'Allowances',
    ]);
    expect(menuItems()[0]!.getAttribute('aria-checked')).toBe('true');
    expect(menuItems()[1]!.getAttribute('aria-checked')).toBe('false');
  });

  it('emits the toggled layer and keeps the menu open', async () => {
    const wrapper = await mountMenu();

    menuItems()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(wrapper.emitted('toggle')).toEqual([['construction', false]]);
    expect(menuItems()).toHaveLength(2);
  });

  it('treats a missing layer value as off', async () => {
    await mountMenu({ allowances: true });

    expect(menuItems()[0]!.getAttribute('aria-checked')).toBe('false');
    expect(menuItems()[1]!.getAttribute('aria-checked')).toBe('true');
  });

  it('closes when the trigger is clicked again', async () => {
    const wrapper = await mountMenu();

    await wrapper.find('[data-testid="display-menu-trigger"]').trigger('click');

    expect(wrapper.find('[data-testid="display-menu"]').exists()).toBe(false);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const wrapper = await mountMenu();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();

    expect(wrapper.find('[data-testid="display-menu"]').exists()).toBe(false);
    expect(document.activeElement).toBe(
      wrapper.find('[data-testid="display-menu-trigger"]').element,
    );
  });

  it('closes on an outside pointer press but keeps a press inside', async () => {
    const wrapper = await mountMenu();

    wrapper
      .find('[data-testid="display-menu"]')
      .element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-testid="display-menu"]').exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-testid="display-menu"]').exists()).toBe(false);
  });
});
