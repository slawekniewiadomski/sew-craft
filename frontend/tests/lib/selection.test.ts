import {
  createEmptyDocument,
  type ArcEntity,
  type CircleEntity,
  type CurveEntity,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  applySelection,
  orphanedEdges,
  rectMode,
  selectionModeFrom,
  toggleSelection,
} from '@/lib/selection';

function pt(id: string, x = 0, y = 0): PointEntity {
  return { id, kind: 'point', x, y, construction: false, fixed: false };
}

function ln(id: string, start: string, end: string, construction = false): LineEntity {
  return { id, kind: 'line', start, end, construction };
}

function cv(
  id: string,
  points: [string, string, string, string],
  construction = false,
): CurveEntity {
  return {
    id,
    kind: 'curve',
    p0: points[0],
    p1: points[1],
    p2: points[2],
    p3: points[3],
    construction,
  };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

function arc(
  id: string,
  start: string,
  end: string,
  through: string,
  construction = false,
): ArcEntity {
  return { id, kind: 'arc', start, end, through, construction };
}

function ci(id: string, center: string, rim: string, construction = false): CircleEntity {
  return { id, kind: 'circle', center, rim, construction };
}

const modifiers = (overrides: Partial<Record<string, boolean>> = {}) => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe('selectionModeFrom', () => {
  it('replaces without a Ctrl or Cmd modifier', () => {
    expect(selectionModeFrom(modifiers())).toBe('replace');
    expect(selectionModeFrom(modifiers({ altKey: true }))).toBe('replace');
    expect(selectionModeFrom(modifiers({ shiftKey: true }))).toBe('replace');
  });

  it('adds with Ctrl or Cmd and subtracts with their Alt or Shift alias', () => {
    expect(selectionModeFrom(modifiers({ ctrlKey: true }))).toBe('add');
    expect(selectionModeFrom(modifiers({ metaKey: true }))).toBe('add');
    expect(selectionModeFrom(modifiers({ ctrlKey: true, altKey: true }))).toBe('subtract');
    expect(selectionModeFrom(modifiers({ metaKey: true, shiftKey: true }))).toBe('subtract');
  });
});

describe('rectMode', () => {
  it('is crossing when dragged right or straight and window when dragged left', () => {
    expect(rectMode(10, 20)).toBe('crossing');
    expect(rectMode(10, 10)).toBe('crossing');
    expect(rectMode(10, 9)).toBe('window');
  });
});

describe('applySelection', () => {
  it('replaces with the hits in order and removes duplicates', () => {
    expect(applySelection(['a', 'b'], ['c', 'b', 'c'], 'replace')).toEqual(['c', 'b']);
  });

  it('appends only unseen hits for add', () => {
    expect(applySelection(['a', 'b'], ['b', 'c', 'a', 'd'], 'add')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('removes hits while preserving the remaining order for subtract', () => {
    expect(applySelection(['a', 'b', 'c', 'd'], ['b', 'd'], 'subtract')).toEqual(['a', 'c']);
  });

  it('clears on replace with no hits and leaves add/subtract unchanged', () => {
    expect(applySelection(['a'], [], 'replace')).toEqual([]);
    expect(applySelection(['a'], [], 'add')).toEqual(['a']);
    expect(applySelection(['a'], [], 'subtract')).toEqual(['a']);
  });
});

describe('toggleSelection', () => {
  it('appends an absent id and removes a present one', () => {
    expect(toggleSelection(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('orphanedEdges', () => {
  const document = doc([
    pt('a'),
    pt('b'),
    pt('c'),
    pt('d'),
    ln('ab', 'a', 'b'),
    cv('curve', ['a', 'b', 'c', 'd']),
    ci('ring', 'a', 'd'),
    ln('guide', 'c', 'd', true),
    ln('other', 'b', 'c'),
  ]);

  it('names each unselected edge that depends on a selected point', () => {
    expect(orphanedEdges(document, ['a', 'c'])).toEqual(['ab', 'curve', 'ring', 'guide', 'other']);
  });

  it('does not report an edge that is selected with its point', () => {
    expect(orphanedEdges(document, ['a', 'ab'])).toEqual(['curve', 'ring']);
    expect(orphanedEdges(document, ['d', 'ring'])).toEqual(['curve', 'guide']);
  });

  it('reports nothing for an edge-only or empty selection', () => {
    expect(orphanedEdges(document, ['ab', 'curve'])).toEqual([]);
    expect(orphanedEdges(document, [])).toEqual([]);
  });

  it('names an arc that depends on a selected start, end or through point', () => {
    const arcs = doc([pt('a'), pt('b'), pt('c'), arc('arc', 'a', 'b', 'c')]);

    expect(orphanedEdges(arcs, ['a'])).toEqual(['arc']);
    expect(orphanedEdges(arcs, ['b'])).toEqual(['arc']);
    expect(orphanedEdges(arcs, ['c'])).toEqual(['arc']);
    expect(orphanedEdges(arcs, ['arc'])).toEqual([]);
  });
});

describe('orphanedEdges with marks', () => {
  const document = doc([
    pt('a'),
    pt('b'),
    { id: 'notch-1', kind: 'mark', type: 'notch', edge: 'ab', point: 'a' } as never,
    { id: 'centre-1', kind: 'mark', type: 'centre_line', start: 'a', end: 'b' } as never,
  ]);

  it('reports a mark whose point is selected', () => {
    expect(orphanedEdges(document, ['a'])).toEqual(['notch-1', 'centre-1']);
    expect(orphanedEdges(document, ['notch-1'])).toEqual([]);
  });
});
