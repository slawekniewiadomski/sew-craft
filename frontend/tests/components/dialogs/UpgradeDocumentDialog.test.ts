import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import UpgradeDocumentDialog from '@/components/dialogs/UpgradeDocumentDialog.vue';

enableAutoUnmount(afterEach);

const props = {
  savedSchema: 'sewcraft.pattern/0.2',
  editorSchema: 'sewcraft.pattern/0.3',
};

describe('UpgradeDocumentDialog', () => {
  it('explains the supported schema and focuses Cancel', () => {
    const wrapper = mount(UpgradeDocumentDialog, { props, attachTo: document.body });

    expect(wrapper.find('[data-testid="upgrade-dialog-title"]').text()).toBe(
      'Unsupported project format',
    );
    expect(wrapper.find('[data-testid="saved-schema"]').text()).toBe(props.savedSchema);
    expect(wrapper.find('[data-testid="editor-schema"]').text()).toBe(props.editorSchema);
    expect(wrapper.text()).toContain('never migrated or replaced silently');
    expect(wrapper.find('[data-testid="upgrade-update"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="upgrade-readonly"]').text()).toBe('Open read-only');
    expect(document.activeElement).toBe(wrapper.find('[data-testid="upgrade-cancel"]').element);
  });

  it('traps Tab across the two actions and cancels on Escape', async () => {
    const wrapper = mount(UpgradeDocumentDialog, { props, attachTo: document.body });
    const overlay = wrapper.find('[data-testid="upgrade-dialog"]');
    const cancel = wrapper.find('[data-testid="upgrade-cancel"]').element;
    const readOnly = wrapper.find('[data-testid="upgrade-readonly"]').element;

    expect(document.activeElement).toBe(cancel);

    await overlay.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(readOnly);

    await overlay.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    overlay.element.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  it('restores the focus that was active before it opened', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const wrapper = mount(UpgradeDocumentDialog, { props, attachTo: document.body });
    expect(document.activeElement).not.toBe(trigger);

    wrapper.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('emits readonly and cancel', async () => {
    const wrapper = mount(UpgradeDocumentDialog, { props });

    await wrapper.find('[data-testid="upgrade-readonly"]').trigger('click');
    await wrapper.find('[data-testid="upgrade-cancel"]').trigger('click');

    expect(wrapper.emitted('readonly')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
