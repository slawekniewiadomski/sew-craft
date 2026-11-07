import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ModalDialog from '@/components/ModalDialog.vue';

const mountShell = (props: Record<string, unknown> = {}, slot = '<p>body</p>') =>
  mount(ModalDialog, {
    props: { labelledBy: 'title', ...props },
    slots: { default: slot },
  });

describe('ModalDialog', () => {
  it('wires the dialog role to its title and description', () => {
    const wrapper = mountShell({ describedBy: 'body' });
    const dialog = wrapper.find('[role="dialog"]');

    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-labelledby')).toBe('title');
    expect(dialog.attributes('aria-describedby')).toBe('body');
    expect(wrapper.text()).toContain('body');
  });

  it('omits aria-describedby when the dialog has no description', () => {
    const wrapper = mountShell();

    expect(wrapper.find('[role="dialog"]').attributes('aria-describedby')).toBeUndefined();
  });

  it('cancels on Escape and on a backdrop click', async () => {
    const wrapper = mountShell();

    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    wrapper.element.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(wrapper.emitted('cancel')).toHaveLength(1);

    await wrapper.trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(2);
  });

  it('leaves every key and the backdrop alone when it is not dismissible', async () => {
    const wrapper = mountShell({ dismissible: false });

    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    wrapper.element.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(false);
    expect(wrapper.emitted('cancel')).toBeUndefined();

    await wrapper.trigger('click');
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('ignores keys other than Escape', async () => {
    const wrapper = mountShell();

    await wrapper.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('sizes the card and sets its vertical rhythm', () => {
    const small = mountShell();
    const large = mountShell({ size: 'md', density: 'loose' });

    expect(small.find('[role="dialog"]').classes()).toContain('max-w-sm');
    expect(small.find('[role="dialog"]').classes()).toContain('space-y-3');
    expect(large.find('[role="dialog"]').classes()).toContain('max-w-md');
    expect(large.find('[role="dialog"]').classes()).toContain('space-y-4');
  });
});
