import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import UpgradeDocumentDialog from './UpgradeDocumentDialog.vue';

enableAutoUnmount(afterEach);

describe('UpgradeDocumentDialog', () => {
  it('names both schemas for an older document and focuses Cancel', () => {
    const wrapper = mount(UpgradeDocumentDialog, {
      props: { savedSchema: 'sewcraft.pattern/0.1', editorSchema: 'sewcraft.pattern/0.2' },
      attachTo: document.body,
    });

    expect(wrapper.find('[data-testid="upgrade-dialog-title"]').text()).toBe('Save format upgrade');
    expect(wrapper.find('[data-testid="saved-schema"]').text()).toBe('sewcraft.pattern/0.1');
    expect(wrapper.find('[data-testid="editor-schema"]').text()).toBe('sewcraft.pattern/0.2');
    expect(wrapper.find('[data-testid="upgrade-update"]').text()).toBe('Update and open');
    expect(wrapper.find('[data-testid="upgrade-readonly"]').text()).toBe('Read-only');
    expect(document.activeElement).toBe(wrapper.find('[data-testid="upgrade-cancel"]').element);
  });

  it('describes an unknown newer schema without an update action', () => {
    const wrapper = mount(UpgradeDocumentDialog, {
      props: {
        savedSchema: 'sewcraft.pattern/0.3',
        editorSchema: 'sewcraft.pattern/0.2',
        unknown: true,
      },
    });

    expect(wrapper.find('[data-testid="upgrade-dialog-title"]').text()).toBe(
      'Project saved by a newer version',
    );
    expect(wrapper.text()).toContain('newer version of SewCraft');
    expect(wrapper.find('[data-testid="unknown-schema"]').text()).toBe('sewcraft.pattern/0.3');
    expect(wrapper.find('[data-testid="upgrade-update"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="upgrade-readonly"]').text()).toBe('Open read-only');
  });

  it('traps Tab across the three actions and handles other keys', async () => {
    const wrapper = mount(UpgradeDocumentDialog, {
      props: { savedSchema: 'sewcraft.pattern/0.1', editorSchema: 'sewcraft.pattern/0.2' },
      attachTo: document.body,
    });
    const overlay = wrapper.find('[data-testid="upgrade-dialog"]');
    const cancel = wrapper.find('[data-testid="upgrade-cancel"]').element;
    const update = wrapper.find('[data-testid="upgrade-update"]').element;

    expect(document.activeElement).toBe(cancel);

    await overlay.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(update);

    await overlay.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    const middle = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    (wrapper.find('[data-testid="upgrade-readonly"]').element as HTMLElement).focus();
    overlay.element.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);

    const other = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    overlay.element.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('traps Tab on the read-only action for an unknown schema', async () => {
    const wrapper = mount(UpgradeDocumentDialog, {
      props: {
        savedSchema: 'sewcraft.pattern/0.3',
        editorSchema: 'sewcraft.pattern/0.2',
        unknown: true,
      },
      attachTo: document.body,
    });
    const overlay = wrapper.find('[data-testid="upgrade-dialog"]');
    const readOnly = wrapper.find('[data-testid="upgrade-readonly"]').element;
    const cancel = wrapper.find('[data-testid="upgrade-cancel"]').element;

    (readOnly as HTMLElement).focus();
    await overlay.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
  });

  it('restores the focus that was active before it opened', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const wrapper = mount(UpgradeDocumentDialog, {
      props: { savedSchema: 'sewcraft.pattern/0.1', editorSchema: 'sewcraft.pattern/0.2' },
      attachTo: document.body,
    });
    expect(document.activeElement).not.toBe(trigger);

    wrapper.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('emits update, readonly and cancel', async () => {
    const wrapper = mount(UpgradeDocumentDialog, {
      props: { savedSchema: 'sewcraft.pattern/0.1', editorSchema: 'sewcraft.pattern/0.2' },
    });

    await wrapper.find('[data-testid="upgrade-update"]').trigger('click');
    await wrapper.find('[data-testid="upgrade-readonly"]').trigger('click');
    await wrapper.find('[data-testid="upgrade-cancel"]').trigger('click');

    expect(wrapper.emitted('update')).toHaveLength(1);
    expect(wrapper.emitted('readonly')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
