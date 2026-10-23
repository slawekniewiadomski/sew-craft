import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import EditorRibbon from '@/components/EditorRibbon.vue';
import PatternCanvas from '@/components/PatternCanvas.vue';

// Force the command bus to throw so the view's error handling is exercised.
const state = vi.hoisted(() => ({ thrown: new Error('command exploded') as unknown }));

const storedDocument: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'q', kind: 'point', x: 100, y: 0, construction: false, fixed: false },
    { id: 'l', kind: 'line', start: 'p', end: 'q', construction: false },
  ],
};

vi.mock('@/api/projects', () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public body: unknown,
    ) {
      super(`Request failed with status ${status}`);
      this.name = 'ApiError';
    }
  }

  return {
    ApiError,
    projectsApi: {
      getPattern: vi.fn(async () => ({
        data: {
          id: 1,
          project_id: 2,
          name: 'Bodice',
          document: storedDocument,
          version: 1,
          saved_at: '2026-10-23T14:32:00.000Z',
        },
      })),
      savePattern: vi.fn(),
    },
  };
});

vi.mock('@/composables/use-command-bus', async () => {
  const { ref } = await import('vue');
  const { createEmptyDocument } = await import('@sewcraft/geometry');
  return {
    useCommandBus: () => ({
      document: ref({
        ...createEmptyDocument(),
        entities: [
          { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
          { id: 'q', kind: 'point', x: 100, y: 0, construction: false, fixed: false },
          { id: 'l', kind: 'line', start: 'p', end: 'q', construction: false },
        ],
      }),
      journal: ref([]),
      canUndo: ref(false),
      canRedo: ref(false),
      dispatch: () => {
        throw state.thrown;
      },
      dispatchGroup: () => {
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

async function mountView(): Promise<VueWrapper> {
  const { default: EditorView } = await import('./EditorView.vue');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects', name: 'projects', component: { template: '<div />' } },
      { path: '/projects/:id/edit', name: 'editor', component: EditorView, props: true },
    ],
  });
  await router.push('/projects/2/edit');
  await router.isReady();

  const wrapper = mount(EditorView, {
    props: { id: '2' },
    global: { plugins: [createPinia(), router] },
  });
  await flushPromises();
  return wrapper;
}

describe('EditorView error handling', () => {
  it('surfaces an Error thrown by a command', async () => {
    state.thrown = new Error('command exploded');
    const wrapper = await mountView();

    wrapper.findComponent(PatternCanvas).vm.$emit('add-point', 1, 2);
    await nextTick();

    expect(wrapper.text()).toContain('command exploded');
  });

  it('falls back to a generic message for non-Error throws', async () => {
    state.thrown = 'plain failure';
    const wrapper = await mountView();

    wrapper.findComponent(PatternCanvas).vm.$emit('add-point', 1, 2);
    await nextTick();

    expect(wrapper.text()).toContain('Command failed');
  });

  it('routes canvas intents through the error handler', async () => {
    state.thrown = new Error('command exploded');
    const wrapper = await mountView();

    const canvas = wrapper.findComponent(PatternCanvas);
    canvas.vm.$emit('add-point', 1, 2);
    canvas.vm.$emit('move-point', 'p', 1, 2);
    canvas.vm.$emit('add-line', 'p', 'q');
    canvas.vm.$emit('add-curve', ['p', 'q', 'r', 's']);
    canvas.vm.$emit('add-rectangle', 'diagonal', [
      { kind: 'point', id: 'p' },
      { kind: 'point', id: 'q' },
    ]);
    await nextTick();

    expect(wrapper.text()).toContain('command exploded');
  });

  it('retains constraint picks when a constraint command fails', async () => {
    state.thrown = new Error('command exploded');
    const wrapper = await mountView();

    const ribbon = wrapper.findComponent(EditorRibbon);
    ribbon.vm.$emit('select-constraint', 'horizontal');
    await nextTick();

    const canvas = wrapper.findComponent(PatternCanvas);
    canvas.vm.$emit('constraint-pick', { id: 'l', kind: 'line' });
    await nextTick();

    expect(wrapper.text()).toContain('command exploded');
    expect(canvas.props('constraintPicks')).toEqual([{ id: 'l', kind: 'line' }]);
  });
});
