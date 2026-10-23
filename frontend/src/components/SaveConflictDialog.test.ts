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

  it('emits reload and overwrite', async () => {
    const wrapper = mount(SaveConflictDialog);

    await wrapper.find('[data-testid="conflict-reload"]').trigger('click');
    await wrapper.find('[data-testid="conflict-overwrite"]').trigger('click');

    expect(wrapper.emitted('reload')).toHaveLength(1);
    expect(wrapper.emitted('overwrite')).toHaveLength(1);
  });
});
