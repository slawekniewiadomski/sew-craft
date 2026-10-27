import {
  allPoints,
  createEmptyDocument,
  executeCommand,
  type Entity,
  isCornerRoundDerived,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  endpointMissing,
  endpointPosition,
  resolveDraftingEndpoint,
  resolveEndpointCommands,
  resolveLeaderEndpoint,
  resolveTextAnchorEndpoint,
  sameDraftingEndpoint,
  type DraftingEndpoint,
} from './drafting';

function pt(id: string, x: number, y: number): PointEntity {
  return { id, kind: 'point', x, y, construction: false, fixed: false };
}

function ln(id: string, start: string, end: string): LineEntity {
  return { id, kind: 'line', start, end, construction: false };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

const baseDoc = doc([pt('a', 0, 0), pt('b', 100, 0), ln('ab', 'a', 'b')]);

const existing = (id: string): DraftingEndpoint => ({ kind: 'point', id });
const fresh = (x: number, y: number): DraftingEndpoint => ({ kind: 'new', x, y });

describe('endpointPosition', () => {
  it('returns a provisional coordinate as-is', () => {
    expect(endpointPosition(baseDoc, fresh(10, 20))).toEqual({ x: 10, y: 20 });
  });

  it('returns the referenced point’s current position', () => {
    expect(endpointPosition(baseDoc, existing('b'))).toEqual({ x: 100, y: 0 });
  });

  it('returns null when the reference is not a point', () => {
    expect(endpointPosition(baseDoc, existing('ab'))).toBeNull();
  });

  it('returns null when the referenced point is gone', () => {
    expect(endpointPosition(baseDoc, existing('missing'))).toBeNull();
  });
});

describe('endpointMissing', () => {
  it('is false without a pending endpoint', () => {
    expect(endpointMissing(baseDoc, null)).toBe(false);
  });

  it('is false for a provisional coordinate', () => {
    expect(endpointMissing(baseDoc, fresh(10, 20))).toBe(false);
  });

  it('is false while the referenced point exists', () => {
    expect(endpointMissing(baseDoc, existing('b'))).toBe(false);
  });

  it('is true once the referenced point is gone', () => {
    expect(endpointMissing(baseDoc, existing('missing'))).toBe(true);
  });
});

describe('resolveDraftingEndpoint container rules', () => {
  const breaks = (
    id: string,
    x: number,
    y: number,
    role?: 'annotation',
    piece?: string,
  ): PointEntity => ({
    id,
    kind: 'point',
    x,
    y,
    construction: false,
    fixed: false,
    ...(role === undefined ? {} : { role }),
    ...(piece === undefined ? {} : { piece }),
  });

  const document = doc([
    breaks('own', 100, 100, undefined, 'p1'),
    breaks('other', 200, 100, undefined, 'p2'),
    breaks('mark', 300, 100, 'annotation', 'p1'),
  ]);

  it('reuses a point of the active piece', () => {
    expect(resolveDraftingEndpoint(document, { x: 100, y: 100 }, 'p1')).toEqual({
      kind: 'point',
      id: 'own',
    });
  });

  it('ignores annotation and other-piece points', () => {
    expect(resolveDraftingEndpoint(document, { x: 200, y: 100 }, 'p1')).toMatchObject({
      kind: 'new',
    });
    expect(resolveDraftingEndpoint(document, { x: 300, y: 100 }, 'p1')).toMatchObject({
      kind: 'new',
    });
  });

  it('keeps the legacy behaviour without an active piece', () => {
    expect(resolveDraftingEndpoint(document, { x: 200, y: 100 })).toEqual({
      kind: 'point',
      id: 'other',
    });
    expect(resolveDraftingEndpoint(document, { x: 300, y: 100 })).toMatchObject({
      kind: 'new',
    });
  });
});

describe('text endpoints', () => {
  const breaks = (
    id: string,
    x: number,
    y: number,
    role?: 'annotation',
    piece?: string,
  ): PointEntity => ({
    id,
    kind: 'point',
    x,
    y,
    construction: false,
    fixed: false,
    ...(role === undefined ? {} : { role }),
    ...(piece === undefined ? {} : { piece }),
  });

  const document = doc([
    breaks('own', 100, 100, undefined, 'p1'),
    breaks('mark', 140, 100, 'annotation', 'p1'),
    breaks('other', 200, 100, undefined, 'p2'),
  ]);

  it('snaps the anchor to a point but never reuses it', () => {
    expect(resolveTextAnchorEndpoint(document, { x: 101, y: 101 }, 'p1')).toEqual({
      kind: 'new',
      x: 100,
      y: 100,
    });
    expect(resolveTextAnchorEndpoint(document, { x: 44, y: 46 }, 'p1')).toEqual({
      kind: 'new',
      x: 40,
      y: 50,
    });
  });

  it('keeps the anchor out of another piece', () => {
    expect(resolveTextAnchorEndpoint(document, { x: 200, y: 100 }, 'p1')).toEqual({
      kind: 'new',
      x: 200,
      y: 100,
    });
  });

  it('reuses an annotation point and an ordinary point as the target', () => {
    expect(resolveLeaderEndpoint(document, { x: 141, y: 99 }, 'p1')).toEqual({
      kind: 'point',
      id: 'mark',
    });
    expect(resolveLeaderEndpoint(document, { x: 100, y: 100 }, 'p1')).toEqual({
      kind: 'point',
      id: 'own',
    });
  });

  it('creates a target when nothing snaps, and ignores another piece', () => {
    expect(resolveLeaderEndpoint(document, { x: 44, y: 46 }, 'p1')).toEqual({
      kind: 'new',
      x: 40,
      y: 50,
    });
    expect(resolveLeaderEndpoint(document, { x: 200, y: 100 }, 'p1')).toEqual({
      kind: 'new',
      x: 200,
      y: 100,
    });
  });

  it('uses every point when no piece is active', () => {
    expect(resolveLeaderEndpoint(document, { x: 200, y: 100 })).toEqual({
      kind: 'point',
      id: 'other',
    });
  });

  it('never snaps a target to a corner-round-derived point', () => {
    const square = doc([
      breaks('a', 0, 0),
      breaks('b', 100, 0),
      breaks('c', 100, 100),
      breaks('d', 0, 100),
      {
        id: 'ab',
        kind: 'line',
        start: 'a',
        end: 'b',
        construction: false,
      } as LineEntity,
      {
        id: 'bc',
        kind: 'line',
        start: 'b',
        end: 'c',
        construction: false,
      } as LineEntity,
      {
        id: 'cd',
        kind: 'line',
        start: 'c',
        end: 'd',
        construction: false,
      } as LineEntity,
      {
        id: 'da',
        kind: 'line',
        start: 'd',
        end: 'a',
        construction: false,
      } as LineEntity,
    ]);
    const rounded = executeCommand(square, {
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'ab', second: 'bc', radius: 10 },
    }).document;
    const derived = allPoints(rounded).find((point) => isCornerRoundDerived(rounded, point.id))!;

    expect(resolveLeaderEndpoint(rounded, { x: derived.x, y: derived.y })).toMatchObject({
      kind: 'new',
    });
  });
});

describe('midpoint framing', () => {
  const midpoint = (lineId = 'ab'): DraftingEndpoint => ({
    kind: 'midpoint',
    lineId,
    x: 50,
    y: 0,
  });

  it('resolves the midpoint magnet when no existing point snaps', () => {
    expect(resolveDraftingEndpoint(baseDoc, { x: 52, y: 1 }, undefined, 5)).toEqual(midpoint());
  });

  it('keeps the existing point snap ahead of the midpoint', () => {
    expect(resolveDraftingEndpoint(baseDoc, { x: 99, y: 0 }, undefined, 5)).toEqual(existing('b'));
  });

  it('falls back to the grid when no tolerance is requested', () => {
    expect(resolveDraftingEndpoint(baseDoc, { x: 52, y: 1 })).toEqual(fresh(50, 0));
  });

  it('reuses an existing point that sits exactly on the snapped grid', () => {
    const gridPoint = doc([pt('p', 10, 10)]);

    expect(resolveDraftingEndpoint(gridPoint, { x: 5, y: 5 })).toEqual(existing('p'));
  });

  it('tracks a live midpoint and falls back when the line stops resolving', () => {
    expect(endpointPosition(baseDoc, midpoint())).toEqual({ x: 50, y: 0 });
    expect(
      endpointPosition(doc([pt('a', 0, 0), pt('b', 0, 0), ln('ab', 'a', 'b')]), midpoint()),
    ).toEqual({ x: 50, y: 0 });
  });

  it('drops a pending midpoint when its line disappears or degenerates', () => {
    expect(endpointMissing(baseDoc, midpoint())).toBe(false);
    expect(endpointMissing(baseDoc, midpoint('missing'))).toBe(true);
    expect(
      endpointMissing(doc([pt('a', 0, 0), pt('b', 0, 0), ln('ab', 'a', 'b')]), midpoint()),
    ).toBe(true);
  });

  it('compares midpoints by line, never with a provisional coordinate', () => {
    expect(sameDraftingEndpoint(midpoint(), midpoint())).toBe(true);
    expect(sameDraftingEndpoint(midpoint(), midpoint('bc'))).toBe(false);
    expect(sameDraftingEndpoint(midpoint(), fresh(50, 0))).toBe(false);
  });

  it('emits the point and its relation before the geometry', () => {
    const commands: Parameters<typeof resolveEndpointCommands>[1] = [];
    let counter = 0;
    const next = (prefix: string): string => `${prefix}-${++counter}`;

    expect(resolveEndpointCommands(midpoint(), commands, next, 'piece-1')).toBe('point-1');
    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 50, y: 0, piece: 'piece-1' } },
      {
        id: 'constraint-2',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['point-1', 'ab'], piece: 'piece-1' },
      },
    ]);
  });

  it('omits the piece from both commands when none is active', () => {
    const commands: Parameters<typeof resolveEndpointCommands>[1] = [];
    let counter = 0;
    const next = (prefix: string): string => `${prefix}-${++counter}`;

    resolveEndpointCommands(midpoint(), commands, next);

    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 50, y: 0 } },
      {
        id: 'constraint-2',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['point-1', 'ab'] },
      },
    ]);
  });
});
