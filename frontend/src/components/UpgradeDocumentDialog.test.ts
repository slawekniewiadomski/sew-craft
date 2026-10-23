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
