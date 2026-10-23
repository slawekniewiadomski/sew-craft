import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import SaveConflictDialog from './SaveConflictDialog.vue';

enableAutoUnmount(afterEach);

const savedAt = '2026-10-23T16:05:00.000Z';

describe('SaveConflictDialog', () => {
  it('names the other write and focuses Reload', () => {
    const wrapper = mount(SaveConflictDialog, {
      props: { savedAt },
      attachTo: document.body,
    });

    const time = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(savedAt));

    expect(wrapper.text()).toContain(`Another tab saved this project at ${time}.`);
    expect(wrapper.text()).toContain('Reloading discards your unsaved edits.');
    expect(document.activeElement).toBe(wrapper.find('[data-testid="conflict-reload"]').element);
  });

  it('handles a conflict without a checkpoint time', () => {
    const wrapper = mount(SaveConflictDialog, { props: { savedAt: null } });

    expect(wrapper.text()).toContain('Another tab saved this project.');
    expect(wrapper.text()).not.toContain('saved this project at');
  });

  it('traps Tab inside the dialog and handles other keys', async () => {
    const wrapper = mount(SaveConflictDialog, { attachTo: document.body });
    const overlay = wrapper.find('[data-testid="conflict-dialog"]');
    const overwrite = wrapper.find('[data-testid="conflict-overwrite"]').element;
    const reload = wrapper.find('[data-testid="conflict-reload"]').element;

    expect(document.activeElement).toBe(reload);

    await overlay.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(overwrite);

    await overlay.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(reload);

    const shiftFromLast = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    });
    overlay.element.dispatchEvent(shiftFromLast);
    expect(shiftFromLast.defaultPrevented).toBe(false);

    const other = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    overlay.element.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('restores the focus that was active before it opened', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const wrapper = mount(SaveConflictDialog, { attachTo: document.body });
    expect(document.activeElement).not.toBe(trigger);

    wrapper.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('emits reload and overwrite', async () => {
    const wrapper = mount(SaveConflictDialog);

    await wrapper.find('[data-testid="conflict-reload"]').trigger('click');
    await wrapper.find('[data-testid="conflict-overwrite"]').trigger('click');

    expect(wrapper.emitted('reload')).toHaveLength(1);
    expect(wrapper.emitted('overwrite')).toHaveLength(1);
  });
});
