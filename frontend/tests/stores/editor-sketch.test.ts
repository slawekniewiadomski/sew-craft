import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore } from '@/stores/editor';

const documentOf = (): PatternDocument => ({
  ...createEmptyDocument(),
  pieces: [
    { id: 'p1', edges: [], allowances: [], placement: { x: 0, y: 0 } },
    { id: 'p2', edges: [], allowances: [], placement: { x: 300, y: 0 } },
  ],
  assemblies: [{ id: 'a1', name: 'Shell', instances: [] }],
  tabs: [
    { kind: 'piece', id: 'p1' },
    { kind: 'piece', id: 'p2' },
    { kind: 'assembly', id: 'a1' },
  ],
});

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('editor store sketch view', () => {
  it('starts on the tab canvas with the tab as the active piece', () => {
    const store = useEditorStore();
    store.load(documentOf());

    expect(store.sketchView).toBe(false);
    expect(store.activePieceId).toBe('p1');
    expect(store.sketchTarget).toBe('p1');
  });

  it('opens the sketch canvas with the current piece tab as the target', () => {
    const store = useEditorStore();
    store.load(documentOf());
    store.setActiveTab({ kind: 'piece', id: 'p2' });

    store.showSketch();

    expect(store.sketchView).toBe(true);
    expect(store.sketchTarget).toBe('p2');
    expect(store.activePieceId).toBe('p2');
  });

  it('keeps a still-valid target when the canvas is reopened with no piece tab', () => {
    const store = useEditorStore();
    store.load(documentOf());
    store.setActiveTab({ kind: 'assembly', id: 'a1' });
    store.showSketch();
    store.setSketchTarget('p2');

    store.setActiveTab({ kind: 'assembly', id: 'a1' });
    store.showSketch();

    expect(store.sketchTarget).toBe('p2');
    expect(store.activePieceId).toBe('p2');
  });

  it('falls back to the first piece when the active tab is an assembly', () => {
    const store = useEditorStore();
    store.load(documentOf());
    store.setActiveTab({ kind: 'assembly', id: 'a1' });

    store.showSketch();

    expect(store.sketchTarget).toBe('p1');
    expect(store.activePieceId).toBe('p1');
  });

  it('has no target in a pattern with no pieces', () => {
    const store = useEditorStore();
    store.load(createEmptyDocument());

    store.showSketch();

    expect(store.sketchTarget).toBeNull();
    expect(store.activePieceId).toBeNull();
  });

  it('changes the target only to an existing piece', () => {
    const store = useEditorStore();
    store.load(documentOf());
    store.showSketch();

    expect(store.setSketchTarget('p2')).toBe(true);
    expect(store.activePieceId).toBe('p2');
    expect(store.setSketchTarget('gone')).toBe(false);
    expect(store.activePieceId).toBe('p2');
  });

  it('returns to the tab canvas when a tab is activated', () => {
    const store = useEditorStore();
    store.load(documentOf());
    store.showSketch();

    store.setActiveTab({ kind: 'piece', id: 'p1' });

    expect(store.sketchView).toBe(false);
    expect(store.activePieceId).toBe('p1');
  });

  it('moves the target to a surviving piece when the target is deleted', () => {
    const store = useEditorStore();
    store.load(documentOf());
    store.showSketch();
    store.setSketchTarget('p2');

    store.dispatch({ id: 'del', type: 'delete_piece', params: { id: 'p2' } });

    expect(store.sketchTarget).toBe('p1');
    expect(store.activePieceId).toBe('p1');
  });
});
