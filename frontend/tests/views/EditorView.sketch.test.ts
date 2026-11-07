import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import PatternCanvas from '@/components/canvas/PatternCanvas.vue';
import SketchToolbar from '@/components/bars/SketchToolbar.vue';
import { mountLoaded } from './support/editor-harness';

vi.mock('@/lib/download', async () => (await import('./support/editor-mocks')).downloadMock());
vi.mock('@/api/projects', async () => (await import('./support/editor-mocks')).projectsApiMock());

const twoPieceDoc: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, piece: 'p1', fixed: false },
    { id: 'b', kind: 'point', x: 100, y: 0, piece: 'p1', fixed: false },
    { id: 'ab', kind: 'line', start: 'a', end: 'b', piece: 'p1' },
    { id: 'e', kind: 'point', x: 0, y: 0, piece: 'p2', fixed: false },
    { id: 'f', kind: 'point', x: 80, y: 0, piece: 'p2', fixed: false },
    { id: 'ef', kind: 'line', start: 'e', end: 'f', piece: 'p2' },
  ],
  pieces: [
    { id: 'p1', name: 'Front', edges: [], allowances: [], placement: { x: 0, y: 0 } },
    { id: 'p2', name: 'Sleeve', edges: [], allowances: [], placement: { x: 300, y: 0 } },
  ],
  tabs: [
    { kind: 'piece', id: 'p1' },
    { kind: 'piece', id: 'p2' },
  ],
};

const assemblyOnlyDoc: PatternDocument = {
  ...createEmptyDocument(),
  entities: [{ id: 'loose', kind: 'point', x: 0, y: 0, fixed: false }],
  assemblies: [{ id: 'a1', name: 'Shell', instances: [] }],
  tabs: [{ kind: 'assembly', id: 'a1' }],
};

async function mountSketch() {
  const { wrapper, store } = await mountLoaded(twoPieceDoc);
  await wrapper.find('[data-testid="tab-sketch"]').trigger('click');
  await nextTick();
  return { wrapper, store };
}

describe('EditorView sketch canvas', () => {
  it('opens the shared canvas with the active piece as the target', async () => {
    const { wrapper, store } = await mountSketch();

    expect(store.sketchView).toBe(true);
    expect(store.sketchTarget).toBe('p1');
    expect(wrapper.findComponent(SketchToolbar).exists()).toBe(true);

    const canvas = wrapper.findComponent(PatternCanvas);
    expect(canvas.props('activePieceId')).toBe('p1');
    const points = canvas.props('document').entities.filter((entity) => entity.kind === 'point');
    expect(points.find((point) => point.id === 'e')).toMatchObject({ x: 300, y: 0 });
    expect(points.find((point) => point.id === 'a')).toMatchObject({ x: 0, y: 0 });
  });

  it('retargets from the toolbar picker', async () => {
    const { wrapper, store } = await mountSketch();

    await wrapper.find('[data-testid="sketch-target"]').setValue('p2');
    await nextTick();

    expect(store.sketchTarget).toBe('p2');
    expect(wrapper.findComponent(PatternCanvas).props('activePieceId')).toBe('p2');
  });

  it('moves a whole piece in Arrange mode without touching geometry', async () => {
    const { wrapper, store } = await mountSketch();
    await wrapper.find('[data-testid="sketch-target"]').setValue('p2');
    await wrapper.find('[data-testid="sketch-arrange"]').trigger('click');
    await nextTick();

    expect(wrapper.findComponent(PatternCanvas).props('moveMode')).toBe(true);

    wrapper.findComponent(PatternCanvas).vm.$emit('move-piece', 12, -4);
    await nextTick();

    expect(store.document.pieces[1]!.placement).toEqual({ x: 312, y: -4 });
    expect(store.document.entities.find((entity) => entity.id === 'e')).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it('ignores a whole-piece move outside the sketch canvas', async () => {
    const { wrapper, store } = await mountLoaded(twoPieceDoc);

    wrapper.findComponent(PatternCanvas).vm.$emit('move-piece', 12, -4);
    await nextTick();

    expect(store.document.pieces[1]!.placement).toEqual({ x: 300, y: 0 });
  });

  it('retargets when a piece is clicked or a drafting attempt lands on it', async () => {
    const { wrapper, store } = await mountSketch();
    const canvas = wrapper.findComponent(PatternCanvas);

    canvas.vm.$emit('activate-piece', 'p2');
    await nextTick();
    expect(store.sketchTarget).toBe('p2');

    canvas.vm.$emit('cross-piece', 'p1');
    await nextTick();
    expect(store.sketchTarget).toBe('p1');
  });

  it('keeps a multi-piece selection on the piece that owns its first entity', async () => {
    const { wrapper, store } = await mountSketch();
    store.setSketchTarget('p2');
    await nextTick();

    const canvas = wrapper.findComponent(PatternCanvas);
    canvas.vm.$emit('update:selectedEntityIds', ['a', 'e']);
    await nextTick();

    expect(store.sketchTarget).toBe('p1');
    expect(canvas.props('selectedEntityIds')).toEqual(['a']);
  });

  it('clears the selection when the canvas empties it', async () => {
    const { wrapper } = await mountSketch();
    const canvas = wrapper.findComponent(PatternCanvas);

    canvas.vm.$emit('update:selectedEntityIds', ['a']);
    await nextTick();
    canvas.vm.$emit('update:selectedEntityIds', []);
    await nextTick();

    expect(canvas.props('selectedEntityIds')).toEqual([]);
  });

  it('keeps an unowned selection when the pattern has no target piece', async () => {
    const { wrapper, store } = await mountLoaded(assemblyOnlyDoc);
    await wrapper.find('[data-testid="tab-sketch"]').trigger('click');
    await nextTick();

    expect(store.sketchTarget).toBeNull();
    const canvas = wrapper.findComponent(PatternCanvas);
    canvas.vm.$emit('update:selectedEntityIds', ['loose']);
    await nextTick();

    expect(canvas.props('selectedEntityIds')).toEqual(['loose']);
  });

  it('drops an unowned entity when a target piece exists', async () => {
    const { wrapper } = await mountSketch();
    const canvas = wrapper.findComponent(PatternCanvas);

    canvas.vm.$emit('update:selectedEntityIds', ['loose']);
    await nextTick();

    expect(canvas.props('selectedEntityIds')).toEqual([]);
  });

  it('stores a new point in the target piece coordinates', async () => {
    const { wrapper, store } = await mountSketch();
    await wrapper.find('[data-testid="sketch-target"]').setValue('p2');
    await nextTick();

    wrapper.findComponent(PatternCanvas).vm.$emit('add-point', 320, 40);
    await nextTick();

    const created = store.document.entities.find(
      (entity) => entity.kind === 'point' && entity.piece === 'p2' && entity.x === 20,
    );
    expect(created).toMatchObject({ kind: 'point', y: 40 });
  });

  it('moves a point by the target piece offset', async () => {
    const { wrapper, store } = await mountSketch();
    await wrapper.find('[data-testid="sketch-target"]').setValue('p2');
    await nextTick();

    wrapper.findComponent(PatternCanvas).vm.$emit('move-point', 'e', 350, 20);
    await nextTick();

    expect(store.document.entities.find((entity) => entity.id === 'e')).toMatchObject({
      x: 50,
      y: 20,
    });
  });

  it('splits a placed line using shared-space coordinates', async () => {
    const { wrapper, store } = await mountSketch();
    await wrapper.find('[data-testid="sketch-target"]').setValue('p2');
    await nextTick();

    wrapper.findComponent(PatternCanvas).vm.$emit('split-line', 'ef', 340, 0);
    await nextTick();

    const points = store.document.entities.filter(
      (entity) => entity.kind === 'point' && entity.piece === 'p2',
    );
    expect(points).toHaveLength(3);
    expect(points.some((point) => point.kind === 'point' && point.x === 40)).toBe(true);
    const lines = store.document.entities.filter(
      (entity) => entity.kind === 'line' && entity.piece === 'p2',
    );
    expect(lines).toHaveLength(2);
  });

  it('adds a point on a placed line using shared-space coordinates', async () => {
    const { wrapper, store } = await mountSketch();
    await wrapper.find('[data-testid="sketch-target"]').setValue('p2');
    await nextTick();

    wrapper.findComponent(PatternCanvas).vm.$emit('add-point-on-line', 'ef', 340, 0);
    await nextTick();

    const created = store.document.entities.find(
      (entity) => entity.kind === 'point' && entity.piece === 'p2' && entity.x === 40,
    );
    expect(created).toMatchObject({ kind: 'point', y: 0 });
    expect(store.document.constraints).toHaveLength(1);
  });

  it('ignores a canvas retarget outside the sketch canvas', async () => {
    const { wrapper, store } = await mountLoaded(twoPieceDoc);
    store.setActiveTab({ kind: 'piece', id: 'p1' });
    await nextTick();

    wrapper.findComponent(PatternCanvas).vm.$emit('activate-piece', 'p2');
    await nextTick();

    expect(store.sketchTarget).toBe('p1');
    expect(store.activePieceId).toBe('p1');
  });

  it('ignores a retarget to a piece that no longer exists', async () => {
    const { wrapper, store } = await mountSketch();

    wrapper.findComponent(PatternCanvas).vm.$emit('cross-piece', 'gone');
    await nextTick();

    expect(store.sketchTarget).toBe('p1');
  });

  it('returns to the tab canvas and leaves Arrange mode', async () => {
    const { wrapper, store } = await mountSketch();
    await wrapper.find('[data-testid="sketch-arrange"]').trigger('click');
    await nextTick();

    await wrapper.find('[data-testid="tab-piece-p2"]').trigger('click');
    await flushPromises();

    expect(store.sketchView).toBe(false);
    expect(store.activeTab).toEqual({ kind: 'piece', id: 'p2' });
    expect(wrapper.findComponent(SketchToolbar).exists()).toBe(false);
    expect(wrapper.findComponent(PatternCanvas).props('moveMode')).toBe(false);
  });
});
