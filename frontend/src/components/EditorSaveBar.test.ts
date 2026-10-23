import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import EditorSaveBar from './EditorSaveBar.vue';

enableAutoUnmount(afterEach);

const savedAt = '2026-10-23T14:32:00.000Z';

function formatSavedTime(): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(savedAt),
  );
}

function mountBar(props: Record<string, unknown> = {}) {
  return mount(EditorSaveBar, {
    props: { name: 'Bodice', state: 'dirty', savedAt: null, ...props },
  });
}

describe('EditorSaveBar', () => {
  it('names the pattern and marks a new project as unsaved', () => {
    const wrapper = mountBar({ state: 'new' });

    expect(wrapper.find('[data-testid="pattern-name"]').text()).toBe('Bodice');
    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('New pattern — not saved yet');
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="save-dirty-dot"]').exists()).toBe(false);
  });

  it('shows unsaved changes with a dot and an enabled Save', () => {
    const wrapper = mountBar({ state: 'dirty' });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Unsaved changes');
    expect(wrapper.find('[data-testid="save-dirty-dot"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="save-status"]').attributes('aria-live')).toBe('polite');
  });

  it('shows the saving state with Save disabled', () => {
    const wrapper = mountBar({ state: 'saving' });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Saving…');
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeDefined();
  });

  it('shows the saved time when a checkpoint exists', () => {
    const wrapper = mountBar({ state: 'saved', savedAt });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe(`Saved ${formatSavedTime()}`);
    expect(wrapper.find('[data-testid="save-dirty-dot"]').exists()).toBe(false);
  });

  it('shows a plain saved state without a checkpoint timestamp', () => {
    const wrapper = mountBar({ state: 'saved', savedAt: null });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Saved');
  });

  it('shows a retryable failure assertively', () => {
    const wrapper = mountBar({ state: 'failed' });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Save failed — retry');
    expect(wrapper.find('[data-testid="save-status"]').attributes('aria-live')).toBe('assertive');
    expect(wrapper.find('[data-testid="save-status"]').classes()).toContain('text-destructive');
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeUndefined();
  });

  it('blocks saving and shows the read-only pill for a read-only document', () => {
    const wrapper = mountBar({ state: 'dirty', readOnly: true });

    expect(wrapper.find('[data-testid="read-only-pill"]').text()).toBe('Read-only (older format)');
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeDefined();
  });

  it('emits save from the button', async () => {
    const wrapper = mountBar({ state: 'dirty' });

    await wrapper.find('[data-testid="save-project"]').trigger('click');

    expect(wrapper.emitted('save')).toHaveLength(1);
  });
});
