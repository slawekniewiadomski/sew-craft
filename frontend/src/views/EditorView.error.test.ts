import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import PatternCanvas from '@/components/PatternCanvas.vue';

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

  it('routes canvas intents through the error handler', async () => {
    state.thrown = new Error('command exploded');
    const { default: EditorView } = await import('./EditorView.vue');
    const wrapper = mount(EditorView, { props: { id: '2' } });
    await flushPromises();

    const canvas = wrapper.findComponent(PatternCanvas);
    canvas.vm.$emit('add-point', 1, 2);
    canvas.vm.$emit('move-point', 'p', 1, 2);
    canvas.vm.$emit('add-line', 'p', 'q');
    canvas.vm.$emit('add-curve', ['p', 'q', 'r', 's']);
    await nextTick();

    expect(wrapper.text()).toContain('command exploded');
  });
});
