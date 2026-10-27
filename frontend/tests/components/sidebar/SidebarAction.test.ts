import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import SidebarAction from '@/components/sidebar/SidebarAction.vue';

enableAutoUnmount(afterEach);

function mountAction(disabled = false) {
  return mount(SidebarAction, {
    props: { icon: 'delete', label: 'Remove dimension w', disabled },
    attrs: { 'data-testid': 'row-action' },
    attachTo: document.body,
  });
}

describe('SidebarAction', () => {
  it('renders a compact button named by its label', () => {
    const wrapper = mountAction();
    const button = wrapper.find('[data-testid="row-action"]');

    expect(button.attributes('aria-label')).toBe('Remove dimension w');
    expect(button.classes()).toContain('h-7');
    expect(button.classes()).toContain('w-7');
    expect(button.find('svg').exists()).toBe(true);
  });

  it('emits click when pressed', async () => {
    const wrapper = mountAction();

    await wrapper.find('[data-testid="row-action"]').trigger('click');

    expect(wrapper.emitted('click')).toEqual([[]]);
  });

  it('refuses clicks while disabled', async () => {
    const wrapper = mountAction(true);
    const button = wrapper.find('[data-testid="row-action"]');

    expect(button.attributes('disabled')).toBeDefined();
    await button.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('opens its tooltip on keyboard focus', async () => {
    vi.useFakeTimers();
    const wrapper = mountAction();

    await wrapper.find('[data-testid="row-action"]').trigger('focus');
    await vi.advanceTimersByTimeAsync(400);
    await nextTick();

    expect(document.body.textContent).toContain('Remove dimension w');
    vi.useRealTimers();
  });
});
