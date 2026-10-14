import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

// Force the command bus to throw so the view's error handling is exercised.
const state = vi.hoisted(() => ({ thrown: new Error('command exploded') as unknown }));

vi.mock('@/composables/use-command-bus', async () => {
  const { ref } = await import('vue');
  const { createEmptyDocument } = await import('@sewcraft/geometry');
  return {
    useCommandBus: () => ({
      document: ref(createEmptyDocument()),
      journal: ref([]),
      canUndo: ref(false),
      canRedo: ref(false),
      dispatch: () => {
        throw state.thrown;
      },
      undo: () => {
        throw state.thrown;
      },
      redo: () => {
        throw state.thrown;
      },
    }),
  };
});

describe('EditorView error handling', () => {
  it('surfaces an Error thrown by a command', async () => {
    state.thrown = new Error('command exploded');
    const { default: EditorView } = await import('./EditorView.vue');
    const wrapper = mount(EditorView, { props: { id: '2' } });
    await flushPromises();

    expect(wrapper.text()).toContain('command exploded');
  });

  it('falls back to a generic message for non-Error throws', async () => {
    state.thrown = 'plain failure';
    const { default: EditorView } = await import('./EditorView.vue');
    const wrapper = mount(EditorView, { props: { id: '2' } });
    await flushPromises();

    expect(wrapper.text()).toContain('Command failed');
  });

  it('keeps the add-point action wired to the error handler', async () => {
    state.thrown = new Error('command exploded');
    const { default: EditorView } = await import('./EditorView.vue');
    const wrapper = mount(EditorView, { props: { id: '2' } });
    await flushPromises();

    const add = wrapper.findAll('button').find((button) => button.text() === 'Add point')!;
    await add.trigger('click');

    expect(wrapper.text()).toContain('command exploded');
  });
});
