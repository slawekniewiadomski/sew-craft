import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  derivedDimensionGeometry,
  dimensionGeometry,
  dimensionsInRect,
  entitiesInRect,
  type CircleEntity,
  type CurveEntity,
  type ArcEntity,
  type Constraint,
  type DerivedDistanceConstraint,
  type DistanceConstraint,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type Rect,
} from '../src/index.js';

const point = (id: string, x: number, y: number): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: false,
  fixed: false,
});

const line = (id: string, start: string, end: string): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  construction: false,
});

const curve = (id: string, points: [string, string, string, string]): CurveEntity => ({
  id,
  kind: 'curve',
  p0: points[0],
  p1: points[1],
  p2: points[2],
  p3: points[3],
  construction: false,
});

const circle = (id: string, center: string, rim: string): CircleEntity => ({
  id,
  kind: 'circle',
  center,
  rim,
  construction: false,
});

const documentOf = (entities: Entity[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
});

const arc = (id: string, start: string, end: string, through: string): ArcEntity => ({
  id,
  kind: 'arc',
  start,
  end,
  through,
  construction: false,
});

const rect = (minX: number, minY: number, maxX: number, maxY: number): Rect => ({
  minX,
  minY,
  maxX,
  maxY,
});

describe('entitiesInRect', () => {
  const document = documentOf([
    point('inside', 5, 5),
    point('border', 10, 10),
    point('outside', 20, 20),
    point('p0', 0, 0),
    point('p1', 10, 0),
    point('p2', 10, 10),
    point('p3', 0, 10),
    point('far', 100, 100),
    line('crossing', 'inside', 'outside'),
    line('contained', 'p0', 'p1'),
    line('outside-line', 'outside', 'far'),
    line('collinear', 'p0', 'p2'),
    curve('inside-curve', ['p0', 'p1', 'p2', 'p3']),
    curve('crossing-curve', ['p0', 'p1', 'outside', 'p3']),
    curve('outside-curve', ['far', 'far', 'far', 'far']),
    curve('degenerate', ['p0', 'p0', 'p0', 'p0']),
  ]);

  it('selects points inside or on the rectangle and leaves outside points', () => {
    expect(entitiesInRect(document, rect(0, 0, 10, 10), 'crossing')).toEqual(
      expect.arrayContaining(['inside', 'border']),
    );
    expect(entitiesInRect(document, rect(0, 0, 10, 10), 'crossing')).not.toContain('outside');
  });

  it('selects a crossing line by an endpoint, an edge crossing or collinear overlap', () => {
    const hits = entitiesInRect(document, rect(2, -5, 8, 5), 'crossing');

    expect(hits).toContain('crossing');
    expect(hits).toContain('collinear');
    expect(hits).not.toContain('outside-line');
  });

  it('keeps only fully contained lines in window mode', () => {
    expect(entitiesInRect(document, rect(0, 0, 10, 10), 'window')).toContain('contained');
    expect(entitiesInRect(document, rect(2, -5, 8, 5), 'window')).not.toContain('crossing');
  });

  it('uses the control-point hull for a crossing curve', () => {
    const hits = entitiesInRect(document, rect(4, -2, 6, 2), 'crossing');

    expect(hits).toContain('crossing-curve');
    expect(hits).not.toContain('outside-curve');
  });

  it('selects a curve whose control polygon misses the rectangle but whose curve passes through', () => {
    // Control points form a narrow loop around the rectangle's corner.
    const loop = documentOf([
      point('a', 0, 0),
      point('b', 10, 0),
      point('c', 0, 10),
      point('d', 10, 10),
      curve('loop', ['a', 'b', 'c', 'd']),
    ]);

    expect(entitiesInRect(loop, rect(4, 4, 6, 6), 'crossing')).toContain('loop');
  });

  it('requires every curve control point for window mode', () => {
    expect(entitiesInRect(document, rect(0, 0, 10, 10), 'window')).toContain('inside-curve');
    expect(entitiesInRect(document, rect(0, 0, 5, 5), 'window')).not.toContain('inside-curve');
  });

  it('handles a degenerate curve and a collinear hull without throwing', () => {
    expect(entitiesInRect(document, rect(-1, -1, 1, 1), 'crossing')).toContain('degenerate');
    expect(entitiesInRect(document, rect(50, 50, 60, 60), 'crossing')).not.toContain('degenerate');
  });

  it('returns entities in document order and keeps construction entities', () => {
    const ordered = documentOf([
      line('first', 'a', 'b'),
      point('a', 0, 0),
      point('b', 10, 0),
      { ...line('guide', 'a', 'b'), construction: true },
    ]);

    expect(entitiesInRect(ordered, rect(-1, -1, 11, 1), 'crossing')).toEqual([
      'first',
      'a',
      'b',
      'guide',
    ]);
  });

  it('skips an entity whose point reference is missing', () => {
    const dangling = documentOf([line('dangling', 'a', 'missing')]);

    expect(entitiesInRect(dangling, rect(-1, -1, 11, 1), 'crossing')).toEqual([]);
  });
});

describe('entitiesInRect with arcs', () => {
  const document = documentOf([
    point('s', -10, 0),
    point('t', 0, 10),
    point('e', 10, 0),
    point('flat-s', 0, 20),
    point('flat-e', 10, 20),
    point('flat-t', 5, 20),
    arc('bulge', 's', 'e', 't'),
    arc('flat', 'flat-s', 'flat-e', 'flat-t'),
    arc('dangling', 's', 'e', 'missing'),
  ]);

  it('selects an arc in window mode only when its whole bounding box is inside', () => {
    expect(entitiesInRect(document, rect(-10, 0, 10, 10), 'window')).toContain('bulge');
    expect(entitiesInRect(document, rect(-10, 0, 9, 10), 'window')).not.toContain('bulge');
  });

  it('selects an arc in crossing mode when its box overlaps even if no point is inside', () => {
    expect(entitiesInRect(document, rect(3, 1, 7, 3), 'crossing')).toContain('bulge');
  });

  it('falls back to the three-point hull for a degenerate arc', () => {
    expect(entitiesInRect(document, rect(-1, 19, 11, 21), 'crossing')).toContain('flat');
    expect(entitiesInRect(document, rect(-1, 19, 11, 21), 'window')).toContain('flat');
  });

  it('skips a dangling arc without throwing', () => {
    const hits = entitiesInRect(document, rect(-20, -20, 20, 20), 'crossing');

    expect(hits).not.toContain('dangling');
    expect(hits).toContain('bulge');
  });
});

describe('entitiesInRect with circles', () => {
  const document = documentOf([
    point('c', 10, 10),
    point('r', 14, 10),
    point('d', 50, 50),
    point('e', 50, 50),
    point('far', 0, 0),
    point('big', Number.MAX_VALUE, Number.MAX_VALUE),
    circle('ball', 'c', 'r'),
    circle('degenerate', 'd', 'e'),
    circle('dangling', 'c', 'missing'),
    circle('huge', 'c', 'big'),
  ]);

  it('selects a circle in window mode only when its full bounding box is inside', () => {
    // centre 10,10 radius 4 → box 6..14.
    expect(entitiesInRect(document, rect(5, 5, 15, 15), 'window')).toContain('ball');
    expect(entitiesInRect(document, rect(5, 5, 13, 15), 'window')).not.toContain('ball');
  });

  it('selects a circle in crossing mode when its box overlaps, even if no point is inside', () => {
    const hits = entitiesInRect(document, rect(13, 13, 18, 18), 'crossing');

    expect(hits).toContain('ball');
  });

  it('skips a degenerate or dangling circle without throwing', () => {
    const hits = entitiesInRect(document, rect(-10, -10, 100, 100), 'crossing');

    expect(hits).not.toContain('degenerate');
    expect(hits).not.toContain('dangling');
    expect(hits).not.toContain('huge');
    expect(hits).toContain('ball');
  });
});

describe('dimensionsInRect', () => {
  const square: Entity[] = [
    point('a', 0, 0),
    point('b', 100, 0),
    point('c', 100, 100),
    point('d', 0, 100),
    line('ab', 'a', 'b'),
    line('bc', 'b', 'c'),
    line('cd', 'c', 'd'),
    line('da', 'd', 'a'),
  ];
  const piece: Piece = { id: 'p', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] };
  const distance: DistanceConstraint = { id: 'dim', type: 'distance', a: 'a', b: 'b' };
  const derived: DerivedDistanceConstraint = {
    id: 'cut',
    type: 'derived_distance',
    piece: 'p',
    a: { edge: 'ab', at: 'start' },
    b: { edge: 'bc', at: 'end' },
    orientation: 'aligned',
  };

  function fixture(constraints: Constraint[]): PatternDocument {
    return { ...documentOf(square), pieces: [piece], constraints };
  }

  // A default-offset horizontal dimension sits at y = 20, spanning x 0 → 100.
  const document = fixture([distance]);

  it('selects a dimension whose line the crossing rectangle overlaps', () => {
    expect(dimensionsInRect(document, rect(40, 15, 60, 25), 'crossing')).toEqual(['dim']);
  });

  it('selects a window only when both line endpoints are inside', () => {
    expect(dimensionsInRect(document, rect(-5, 10, 105, 30), 'window')).toEqual(['dim']);
    expect(dimensionsInRect(document, rect(10, 10, 90, 30), 'window')).toEqual([]);
    // The same rectangle still crosses the line.
    expect(dimensionsInRect(document, rect(10, 10, 90, 30), 'crossing')).toEqual(['dim']);
  });

  it('ignores a rectangle that covers only an extension line or the label', () => {
    const layout = dimensionGeometry(document, distance)!;

    // The first extension line runs from the measured point down to the
    // dimension line, at x = 0 and below y = 20.
    expect(dimensionsInRect(document, rect(-2, 2, 2, 15), 'crossing')).toEqual([]);

    const label = layout.label.position;
    expect(
      dimensionsInRect(
        document,
        rect(label.x - 2, label.y - 2, label.x + 2, label.y + 2),
        'crossing',
      ),
    ).toEqual([]);
  });

  it('skips unresolvable and non-dimension constraints and keeps order', () => {
    const broken: DistanceConstraint = { id: 'broken', type: 'distance', a: 'a', b: 'missing' };
    const horizontal: Constraint = { id: 'level', type: 'horizontal', a: 'a', b: 'b' };
    const second: DistanceConstraint = {
      id: 'second',
      type: 'distance',
      a: 'c',
      b: 'd',
      orientation: 'horizontal',
    };
    const ordered = fixture([broken, horizontal, distance, second]);

    expect(dimensionsInRect(ordered, rect(-5, -20, 105, 130), 'crossing')).toEqual([
      'dim',
      'second',
    ]);
  });

  it('selects a derived cut dimension on the same terms', () => {
    const document = fixture([derived]);
    const layout = derivedDimensionGeometry(document, derived)!;
    const start = layout.dimensionStart;
    const end = layout.dimensionEnd;
    const around = rect(
      Math.min(start.x, end.x) - 1,
      Math.min(start.y, end.y) - 1,
      Math.max(start.x, end.x) + 1,
      Math.max(start.y, end.y) + 1,
    );

    expect(dimensionsInRect(document, around, 'window')).toEqual(['cut']);
    expect(dimensionsInRect(document, rect(-5, -5, 5, 5), 'crossing')).toEqual([]);
  });

  it('skips a derived dimension whose piece is missing', () => {
    expect(dimensionsInRect(fixture([derived]), rect(-100, -100, 200, 200), 'crossing')).toEqual([
      'cut',
    ]);

    const withoutPiece: PatternDocument = { ...fixture([derived]), pieces: [] };
    expect(dimensionsInRect(withoutPiece, rect(-100, -100, 200, 200), 'crossing')).toEqual([]);
  });
});

describe('entitiesInRect text', () => {
  const text = {
    id: 't',
    kind: 'text' as const,
    piece: 'p',
    anchor: 'a',
    content: 'hello',
  };

  it('hits a label box in crossing and window modes', () => {
    const document = documentOf([point('a', 10, 10), text]);

    expect(
      entitiesInRect(document, { minX: 20, minY: 5, maxX: 30, maxY: 9 }, 'crossing'),
    ).toContain('t');
    expect(
      entitiesInRect(document, { minX: 0, minY: 0, maxX: 40, maxY: 20 }, 'window'),
    ).toContain('t');
    expect(
      entitiesInRect(document, { minX: 0, minY: 0, maxX: 12, maxY: 5 }, 'window'),
    ).not.toContain('t');
  });

  it('skips a label whose anchor is missing', () => {
    const document = documentOf([text]);
    expect(
      entitiesInRect(document, { minX: -100, minY: -100, maxX: 100, maxY: 100 }, 'crossing'),
    ).not.toContain('t');
  });
});
