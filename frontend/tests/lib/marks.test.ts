import {
  createEmptyDocument,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { distanceToPolyline, notchTargetAt } from '@/lib/marks';

const point = (id: string, x: number, y: number): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  fixed: false,
});

const line = (id: string, start: string, end: string): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
});

const rect: Entity[] = [
  point('a', 0, 0),
  point('b', 200, 0),
  point('c', 200, 200),
  point('d', 0, 200),
  point('m', 100, 0),
  line('bottom', 'a', 'b'),
  line('right', 'b', 'c'),
  line('top', 'c', 'd'),
  line('left', 'd', 'a'),
];

const piece: Piece = {
  id: 'piece-1',
  edges: ['bottom', 'right', 'top', 'left'],
  allowances: [],
};

const documentOf = (extra: Entity[] = []): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [...rect, ...extra],
  pieces: [piece],
});

describe('distanceToPolyline', () => {
  it('measures to the nearest segment, including its ends', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];

    expect(distanceToPolyline(polyline, { x: 50, y: 40 })).toBeCloseTo(40, 9);
    expect(distanceToPolyline(polyline, { x: 100, y: 120 })).toBeCloseTo(20, 9);
    expect(distanceToPolyline(polyline, { x: -30, y: 0 })).toBeCloseTo(30, 9);
  });

  it('treats a repeated point as a zero-length segment', () => {
    expect(
      distanceToPolyline(
        [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
        { x: 5, y: 15 },
      ),
    ).toBeCloseTo(10, 9);
  });
});

describe('notchTargetAt', () => {
  it('picks the edge under the pointer at a shared corner', () => {
    // Point `b` is the corner of `bottom` and `right`; above it means `right`.
    expect(notchTargetAt(documentOf(), 'piece-1', 'b', { x: 240, y: 40 })).toEqual({
      point: 'b',
      edge: 'right',
    });
    expect(notchTargetAt(documentOf(), 'piece-1', 'b', { x: 40, y: 40 })).toEqual({
      point: 'b',
      edge: 'bottom',
    });
  });

  it('returns null for a point off the loop or an unknown piece', () => {
    expect(
      notchTargetAt(documentOf([point('inner', 100, 100)]), 'piece-1', 'inner', { x: 100, y: 100 }),
    ).toBeNull();
    expect(notchTargetAt(documentOf(), 'gone', 'b', { x: 0, y: 0 })).toBeNull();
  });

  it('skips an edge that draws no polyline and a target that is not a point', () => {
    const document: PatternDocument = {
      ...documentOf(),
      entities: [
        ...documentOf().entities,
        point('centre', 100, 100),
        point('rim', 120, 100),
        { id: 'hole', kind: 'circle', center: 'centre', rim: 'rim' },
      ],
      pieces: [{ ...piece, edges: ['hole', 'bottom'] }],
    };

    expect(notchTargetAt(document, 'piece-1', 'centre', { x: 120, y: 100 })).toBeNull();
    expect(notchTargetAt(document, 'piece-1', 'bottom', { x: 40, y: 0 })).toBeNull();
  });
});
