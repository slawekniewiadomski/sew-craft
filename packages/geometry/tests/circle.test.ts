import { describe, expect, it } from 'vitest';

import {
  circleGeometry,
  circlePoints,
  createEmptyDocument,
  MIN_RADIUS,
  type CircleEntity,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '../src/index.js';

const point = (
  id: string,
  x: number,
  y: number,
  options: { construction?: boolean; fixed?: boolean } = {},
): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: options.construction ?? false,
  fixed: options.fixed ?? false,
});

const circle = (
  id: string,
  center: string,
  rim: string,
  options: { construction?: boolean } = {},
): CircleEntity => ({
  id,
  kind: 'circle',
  center,
  rim,
  construction: options.construction ?? false,
});

const documentOf = (entities: Entity[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
});

describe('circleGeometry', () => {
  it('derives the centre, rim and radius from the two referenced points', () => {
    const document = documentOf([point('c', 10, 20), point('r', 13, 24), circle('c1', 'c', 'r')]);

    expect(circleGeometry(document, circle('c1', 'c', 'r'))).toEqual({
      center: { x: 10, y: 20 },
      rim: { x: 13, y: 24 },
      radius: 5,
    });
  });

  it('returns null when a referenced point is missing', () => {
    const document = documentOf([point('c', 0, 0), circle('c1', 'c', 'missing')]);

    expect(circleGeometry(document, circle('c1', 'c', 'missing'))).toBeNull();
  });

  it('returns null when a reference does not point at a point entity', () => {
    const line: LineEntity = { id: 'l', kind: 'line', start: 'c', end: 'c', construction: false };
    const document = documentOf([point('c', 0, 0), line, circle('c1', 'c', 'l')]);

    expect(circleGeometry(document, circle('c1', 'c', 'l'))).toBeNull();
  });

  it('returns null for a degenerate radius below MIN_RADIUS', () => {
    const document = documentOf([point('c', 0, 0), point('r', 0, 0), circle('c1', 'c', 'r')]);
    const tiny = documentOf([
      point('c', 0, 0),
      point('r', MIN_RADIUS / 2, 0),
      circle('c1', 'c', 'r'),
    ]);

    expect(circleGeometry(document, circle('c1', 'c', 'r'))).toBeNull();
    expect(circleGeometry(tiny, circle('c1', 'c', 'r'))).toBeNull();
  });

  it('returns null when a coordinate makes the radius non-finite', () => {
    const document = documentOf([
      point('c', 0, 0),
      point('r', Number.MAX_VALUE, Number.MAX_VALUE),
      circle('c1', 'c', 'r'),
    ]);

    expect(circleGeometry(document, circle('c1', 'c', 'r'))).toBeNull();
  });
});

describe('circlePoints', () => {
  it('returns the requested number of cardinal points for a four-segment circle', () => {
    const points = circlePoints({ x: 0, y: 0 }, 10, 4);

    expect(points).toHaveLength(4);
    expect(points[0]!.x).toBeCloseTo(10);
    expect(points[0]!.y).toBeCloseTo(0);
    expect(points[1]!.x).toBeCloseTo(0);
    expect(points[1]!.y).toBeCloseTo(10);
    expect(points[2]!.x).toBeCloseTo(-10);
    expect(points[3]!.y).toBeCloseTo(-10);
  });

  it('defaults to a fine closed approximation without repeating the first point', () => {
    const points = circlePoints({ x: 5, y: 5 }, 3);

    expect(points).toHaveLength(64);
    expect(points[0]).not.toEqual(points[points.length - 1]);
  });
});
