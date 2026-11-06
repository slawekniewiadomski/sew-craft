import { createEmptyDocument, type Command, type PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { localizeForSketch } from '@/composables/sketch-command-localization';
import type { useEditorStore } from '@/stores/editor';

type EditorStore = ReturnType<typeof useEditorStore>;

const document: PatternDocument = {
  ...createEmptyDocument(),
  pieces: [{ id: 'p1', edges: [], allowances: [], placement: { x: 100, y: 40 } }],
};

const command: Command = { id: 'p', type: 'add_point', params: { x: 120, y: 60, piece: 'p1' } };

const editor = (overrides: Partial<EditorStore>): EditorStore =>
  ({ document, sketchView: false, sketchTarget: null, ...overrides }) as EditorStore;

describe('localizeForSketch', () => {
  it('passes commands through outside the sketch view', () => {
    const commands = [command];
    expect(localizeForSketch(editor({ sketchView: false }), commands)).toBe(commands);
  });

  it('passes commands through without a target', () => {
    const commands = [command];
    expect(localizeForSketch(editor({ sketchView: true }), commands)).toBe(commands);
  });

  it('translates into the target piece space', () => {
    const localized = localizeForSketch(editor({ sketchView: true, sketchTarget: 'p1' }), [
      command,
    ]);

    expect(localized[0]).toMatchObject({ params: { x: 20, y: 20 } });
  });
});
