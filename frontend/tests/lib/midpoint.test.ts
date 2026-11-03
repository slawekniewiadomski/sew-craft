import {
  createEmptyDocument,
  type Entity,
  type LineEntity,
  type PatternDocument,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { nearestLineMidpoint } from '@/lib/midpoint';

const point = (id: string, x: number, y: number, piece?: string): Entity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: false,
  fixed: false,
  ...(piece === undefined ? {} : { piece }),
});

const line = (id: string, start: string, end: string, piece?: string): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  construction: false,
  ...(piece === undefined ? {} : { piece }),
});

const documentOf = (entities: Entity[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
});

const base = documentOf([
  point('a', 0, 0),
  point('b', 100, 0),
  line('ab', 'a', 'b'),
  point('c', 0, 100),
  point('d', 0, 200),
  line('cd', 'c', 'd'),
]);

describe('nearestLineMidpoint', () => {
  it('returns the closest line midpoint within the tolerance', () => {
    expect(nearestLineMidpoint(base, { x: 51, y: 2 }, 8)).toEqual({
      lineId: 'ab',
      x: 50,
      y: 0,
    });
  });

  it('includes the tolerance boundary and rejects a point beyond it', () => {
    expect(nearestLineMidpoint(base, { x: 58, y: 0 }, 8)).toEqual({
      lineId: 'ab',
      x: 50,
      y: 0,
    });
    expect(nearestLineMidpoint(base, { x: 58.1, y: 0 }, 8)).toBeNull();
  });

  it('keeps document order when two midpoints tie', () => {
    const tied = documentOf([
      point('a', 0, 0),
      point('b', 10, 0),
      line('ab', 'a', 'b'),
      point('c', 0, 0),
      point('d', 10, 0),
      line('cd', 'c', 'd'),
    ]);

    expect(nearestLineMidpoint(tied, { x: 5, y: 0 }, 8)).toEqual({ lineId: 'ab', x: 5, y: 0 });
  });

  it('skips annotation lines and degenerate or unresolvable segments', () => {
    const document = documentOf([
      point('a', 0, 0),
      point('b', 10, 0),
      { ...line('annotation', 'a', 'b'), role: 'annotation' },
      point('c', 0, 0),
      line('degenerate', 'a', 'c'),
      line('bad', 'a', 'ghost'),
    ]);

    expect(nearestLineMidpoint(document, { x: 5, y: 0 }, 8)).toBeNull();
  });

  it('limits candidates to the active piece', () => {
    const document = documentOf([
      point('a', 0, 0, 'one'),
      point('b', 10, 0, 'one'),
      line('one', 'a', 'b', 'one'),
      point('c', 0, 100, 'two'),
      point('d', 10, 100, 'two'),
      line('two', 'c', 'd', 'two'),
    ]);

    expect(nearestLineMidpoint(document, { x: 5, y: 100 }, 8, 'one')).toBeNull();
    expect(nearestLineMidpoint(document, { x: 5, y: 100 }, 8, 'two')).toEqual({
      lineId: 'two',
      x: 5,
      y: 100,
    });
    expect(nearestLineMidpoint(document, { x: 5, y: 100 }, 8, null)).not.toBeNull();
  });
});
