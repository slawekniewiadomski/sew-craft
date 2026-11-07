import { createEmptyDocument, type Command, type PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { localizeCommand, localizeCommands, localizeForSketch } from '@/lib/sketch';

const addPoint: Command = { id: 'p', type: 'add_point', params: { x: 120, y: 80, piece: 'p1' } };
const movePoint: Command = { id: 'm', type: 'move_point', params: { id: 'a', x: 10, y: 20 } };
const addLine: Command = { id: 'l', type: 'add_line', params: { start: 'a', end: 'b' } };

describe('sketch command localisation', () => {
  it('subtracts the piece offset from a point position', () => {
    expect(localizeCommand(addPoint, { x: 100, y: 50 })).toEqual({
      id: 'p',
      type: 'add_point',
      params: { x: 20, y: 30, piece: 'p1' },
    });
  });

  it('subtracts the piece offset from a moved point', () => {
    expect(localizeCommand(movePoint, { x: 4, y: 6 })).toEqual({
      id: 'm',
      type: 'move_point',
      params: { id: 'a', x: 6, y: 14 },
    });
  });

  it('leaves a command without a position untouched', () => {
    expect(localizeCommand(addLine, { x: 100, y: 50 })).toBe(addLine);
  });

  it('returns the batch untouched at the origin', () => {
    const commands = [addPoint, addLine];

    expect(localizeCommands(commands, { x: 0, y: 0 })).toBe(commands);
    expect(localizeCommands(commands, { x: 5, y: 0 })).not.toBe(commands);
    expect(localizeCommands(commands, { x: 5, y: 0 })[0]).toMatchObject({
      params: { x: 115, y: 80 },
    });
  });
});

const placementDocument: PatternDocument = {
  ...createEmptyDocument(),
  pieces: [{ id: 'p1', edges: [], allowances: [], placement: { x: 100, y: 40 } }],
};

const placementCommand: Command = {
  id: 'p',
  type: 'add_point',
  params: { x: 120, y: 60, piece: 'p1' },
};

const editor = (
  overrides: Partial<{ sketchView: boolean; sketchTarget: string | null }>,
): { document: PatternDocument; sketchView: boolean; sketchTarget: string | null } => ({
  document: placementDocument,
  sketchView: false,
  sketchTarget: null,
  ...overrides,
});

describe('localizeForSketch', () => {
  it('passes commands through outside the sketch view', () => {
    const commands = [placementCommand];
    expect(localizeForSketch(editor({ sketchView: false }), commands)).toBe(commands);
  });

  it('passes commands through without a target', () => {
    const commands = [placementCommand];
    expect(localizeForSketch(editor({ sketchView: true }), commands)).toBe(commands);
  });

  it('translates into the target piece space', () => {
    const localized = localizeForSketch(editor({ sketchView: true, sketchTarget: 'p1' }), [
      placementCommand,
    ]);

    expect(localized[0]).toMatchObject({ params: { x: 20, y: 20 } });
  });
});
