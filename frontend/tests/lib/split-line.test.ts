import {
  applyCommand,
  createEmptyDocument,
  getEntity,
  type Command,
  type Entity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { buildSplitLineCommands, splitCandidate } from '@/lib/split-line';

function pt(
  id: string,
  x: number,
  y: number,
  options: { piece?: string; role?: 'construction' | 'annotation' } = {},
): PointEntity {
  return {
    id,
    kind: 'point',
    x,
    y,
    construction: options.role === 'construction',
    fixed: false,
    ...(options.piece === undefined ? {} : { piece: options.piece }),
    ...(options.role === undefined ? {} : { role: options.role }),
  };
}

function ln(
  id: string,
  start: EntityId,
  end: EntityId,
  options: { piece?: string; role?: 'construction' | 'annotation'; construction?: boolean } = {},
): LineEntity {
  return {
    id,
    kind: 'line',
    start,
    end,
    construction: options.construction ?? options.role === 'construction',
    ...(options.piece === undefined ? {} : { piece: options.piece }),
    ...(options.role === undefined ? {} : { role: options.role }),
  };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

function idGenerator(): (prefix: string) => EntityId {
  let sequence = 0;
  return (prefix) => {
    sequence += 1;
    return `${prefix}-${sequence}`;
  };
}

const baseDoc = doc([
  pt('a', 0, 0, { piece: 'p1' }),
  pt('b', 100, 0, { piece: 'p1' }),
  pt('near', 54, 0, { piece: 'p1' }),
  pt('off', 70, 0.01, { piece: 'p1' }),
  pt('other-piece', 80, 0, { piece: 'p2' }),
  ln('ab', 'a', 'b', { piece: 'p1' }),
  ln('broken', 'a', 'missing'),
]);

describe('splitCandidate', () => {
  it('projects the pointer onto the line when no authored point is near', () => {
    expect(splitCandidate(baseDoc, 'ab', { x: 30, y: 4 })).toEqual({
      lineId: 'ab',
      pointId: null,
      position: { x: 30, y: 0 },
      atCenter: false,
    });
  });

  it('reuses an authored point within the snap tolerance and on the line', () => {
    expect(splitCandidate(baseDoc, 'ab', { x: 50, y: 0 })).toEqual({
      lineId: 'ab',
      pointId: 'near',
      position: { x: 54, y: 0 },
      atCenter: false,
    });
  });

  it('snaps to the line centre when no authored point is near it', () => {
    const plain = doc([
      pt('a', 0, 0, { piece: 'p1' }),
      pt('b', 100, 0, { piece: 'p1' }),
      ln('ab', 'a', 'b', { piece: 'p1' }),
    ]);

    expect(splitCandidate(plain, 'ab', { x: 48, y: 3 })).toEqual({
      lineId: 'ab',
      pointId: null,
      position: { x: 50, y: 0 },
      atCenter: true,
    });
  });

  it('lets an authored point win over the centre when both are in range', () => {
    expect(splitCandidate(baseDoc, 'ab', { x: 52, y: 0 })).toEqual({
      lineId: 'ab',
      pointId: 'near',
      position: { x: 54, y: 0 },
      atCenter: false,
    });
  });

  it('keeps the projection when the centre is outside the tolerance', () => {
    expect(splitCandidate(baseDoc, 'ab', { x: 43, y: 0 })).toMatchObject({
      pointId: null,
      position: { x: 43, y: 0 },
      atCenter: false,
    });
    expect(splitCandidate(baseDoc, 'ab', { x: 52, y: 0 }, 1)).toMatchObject({ atCenter: false });
  });

  it('ignores a nearby point that is off the line', () => {
    expect(splitCandidate(baseDoc, 'ab', { x: 70, y: 0 })).toMatchObject({
      pointId: null,
      position: { x: 70, y: 0 },
    });
  });

  it('ignores an endpoint', () => {
    expect(splitCandidate(baseDoc, 'ab', { x: 2, y: 0 })).toMatchObject({
      pointId: null,
      position: { x: 2, y: 0 },
    });
  });

  it('ignores a point in another piece', () => {
    expect(splitCandidate(baseDoc, 'ab', { x: 80, y: 0 })).toMatchObject({ pointId: null });
  });

  it('ignores a corner-round-derived point', () => {
    const rightAngle = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 0, 100),
      ln('ab', 'a', 'b'),
      ln('ac', 'a', 'c'),
    ]);
    const rounded = applyCommand(rightAngle, {
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'ab', second: 'ac', radius: 5 },
    });
    expect(splitCandidate(rounded.document, 'ab', { x: 6, y: 0 })).toMatchObject({
      pointId: null,
    });
  });

  it('ignores a midpoint target', () => {
    const withMidpoint: PatternDocument = {
      ...baseDoc,
      constraints: [{ id: 'mid', type: 'midpoint', point: 'near', line: 'ab' }],
    };
    expect(splitCandidate(withMidpoint, 'ab', { x: 54, y: 0 })).toMatchObject({ pointId: null });
  });

  it('returns null for anything that is not a resolvable line', () => {
    expect(splitCandidate(baseDoc, 'a', { x: 30, y: 0 })).toBeNull();
    expect(splitCandidate(baseDoc, 'missing', { x: 30, y: 0 })).toBeNull();
    expect(splitCandidate(baseDoc, 'broken', { x: 30, y: 0 })).toBeNull();
  });

  it('returns null at either end or within a sliver of one', () => {
    expect(splitCandidate(baseDoc, 'ab', { x: 0, y: 0 })).toBeNull();
    expect(splitCandidate(baseDoc, 'ab', { x: 0.0005, y: 0 })).toBeNull();
    expect(splitCandidate(baseDoc, 'ab', { x: 100, y: 0 })).toBeNull();
    expect(splitCandidate(baseDoc, 'ab', { x: 99.9998, y: 0 })).toBeNull();
  });

  it('accepts a custom point tolerance', () => {
    expect(splitCandidate(baseDoc, 'ab', { x: 50, y: 0 }, 1)).toMatchObject({ pointId: null });
  });

  it('ignores a nearby point whose own projection is a sliver', () => {
    const sliver = doc([
      pt('a', 0, 0, { piece: 'p1' }),
      pt('b', 100, 0, { piece: 'p1' }),
      pt('edge', 0.0005, 0, { piece: 'p1' }),
      ln('ab', 'a', 'b', { piece: 'p1' }),
    ]);

    expect(splitCandidate(sliver, 'ab', { x: 0.0015, y: 0 })).toEqual({
      lineId: 'ab',
      pointId: null,
      position: { x: 0.0015, y: 0 },
      atCenter: false,
    });
  });

  it('reuses a point that carries no piece on a piece line', () => {
    const mixed = doc([
      pt('a', 0, 0, { piece: 'p1' }),
      pt('b', 100, 0, { piece: 'p1' }),
      pt('free', 40, 0),
      ln('ab', 'a', 'b', { piece: 'p1' }),
    ]);

    expect(splitCandidate(mixed, 'ab', { x: 40, y: 0 })).toMatchObject({ pointId: 'free' });
  });
});

describe('buildSplitLineCommands', () => {
  it('dispatches one split_line command when reusing a point', () => {
    expect(buildSplitLineCommands(baseDoc, 'ab', { x: 50, y: 0 }, idGenerator())).toEqual([
      { id: 'split-1', type: 'split_line', params: { line: 'ab', point: 'near' } },
    ]);
  });

  it('creates the shared point first when the click does not reuse one', () => {
    expect(buildSplitLineCommands(baseDoc, 'ab', { x: 30, y: 4 }, idGenerator())).toEqual([
      {
        id: 'point-1',
        type: 'add_point',
        params: { x: 30, y: 0, piece: 'p1' },
      },
      { id: 'split-2', type: 'split_line', params: { line: 'ab', point: 'point-1' } },
    ]);
  });

  it('creates the shared point at the exact centre when the projection snaps', () => {
    const plain = doc([pt('a', 0, 0), pt('b', 100, 0), ln('ab', 'a', 'b')]);
    expect(buildSplitLineCommands(plain, 'ab', { x: 52, y: 4 }, idGenerator())).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 50, y: 0 } },
      { id: 'split-2', type: 'split_line', params: { line: 'ab', point: 'point-1' } },
    ]);
  });

  it('mirrors the line role onto the new point', () => {
    const construction = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      ln('ab', 'a', 'b', { role: 'construction' }),
    ]);
    const commands = buildSplitLineCommands(construction, 'ab', { x: 30, y: 0 }, idGenerator());
    expect(commands![0]).toMatchObject({ params: { role: 'construction' } });
  });

  it('mirrors a legacy construction flag onto the new point', () => {
    const legacy = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      ln('ab', 'a', 'b', { construction: true }),
    ]);
    const commands = buildSplitLineCommands(legacy, 'ab', { x: 30, y: 0 }, idGenerator());
    expect(commands![0]).toMatchObject({ params: { construction: true } });
  });

  it('leaves a cut point bare', () => {
    const cut = doc([pt('a', 0, 0), pt('b', 100, 0), ln('ab', 'a', 'b')]);
    const commands = buildSplitLineCommands(cut, 'ab', { x: 30, y: 0 }, idGenerator());
    expect(commands![0]).toEqual({ id: 'point-1', type: 'add_point', params: { x: 30, y: 0 } });
  });

  it('returns null when the click cannot split', () => {
    expect(buildSplitLineCommands(baseDoc, 'ab', { x: 0, y: 0 }, idGenerator())).toBeNull();
    expect(buildSplitLineCommands(baseDoc, 'a', { x: 30, y: 0 }, idGenerator())).toBeNull();
  });

  it('produces a batch the command core accepts', () => {
    const commands = buildSplitLineCommands(baseDoc, 'ab', { x: 30, y: 4 }, idGenerator())!;
    let document: PatternDocument = {
      ...baseDoc,
      pieces: [{ id: 'p1', edges: ['ab'], allowances: [] }],
    };
    for (const command of commands) {
      document = applyCommand(document, command as Command).document;
    }

    expect(getEntity(document, 'ab')).toMatchObject({ start: 'a', end: 'point-1' });
    expect(getEntity(document, 'split-2')).toMatchObject({
      kind: 'line',
      start: 'point-1',
      end: 'b',
      piece: 'p1',
    });
  });
});
