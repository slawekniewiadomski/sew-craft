import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  cubicPoint,
  curvePoints,
  edgePolyline,
  findSelfIntersections,
  offsetPolyline,
  seamAllowancePath,
  seamAllowancePaths,
  type CurveEntity,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
  type Seam,
} from '../src/index.js';

const p = (x: number, y: number) => ({ x, y });

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

const documentOf = (entities: Entity[], seams: Seam[] = []): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
  seams,
});

describe('offsetPolyline', () => {
  it('returns degenerate input unchanged', () => {
    expect(offsetPolyline([], 5)).toEqual([]);
    expect(offsetPolyline([p(1, 2)], 5)).toEqual([p(1, 2)]);
    expect(offsetPolyline([p(0, 0), p(10, 0)], 0)).toEqual([p(0, 0), p(10, 0)]);
    expect(offsetPolyline([p(0, 0), p(10, 0)], 5, { closed: true })).toEqual([p(0, 0), p(10, 0)]);
  });

  it('collapses duplicate consecutive points before offsetting', () => {
    const offset = offsetPolyline([p(0, 0), p(0, 0), p(10, 0)], 1);

    expect(offset).toEqual([p(0, 1), p(10, 1)]);
  });

  it('offsets a single segment to the left for a positive distance', () => {
    expect(offsetPolyline([p(0, 0), p(10, 0)], 1)).toEqual([p(0, 1), p(10, 1)]);
  });

  it('offsets a single segment to the right for a negative distance', () => {
    expect(offsetPolyline([p(0, 0), p(10, 0)], -1)).toEqual([p(0, -1), p(10, -1)]);
  });

  it('continues straight through a collinear vertex', () => {
    const offset = offsetPolyline([p(0, 0), p(10, 0), p(20, 0)], 1);

    expect(offset).toEqual([p(0, 1), p(10, 1), p(20, 1)]);
  });

  it('bevels across a 180-degree reversal', () => {
    const offset = offsetPolyline([p(0, 0), p(10, 0), p(5, 0)], 1);

    expect(offset).toEqual([p(0, 1), p(10, 1), p(10, -1), p(5, -1)]);
  });

  it('mitres an inner (concave) corner', () => {
    const offset = offsetPolyline([p(0, 0), p(10, 0), p(10, 10)], 1);

    expect(offset).toEqual([p(0, 1), p(9, 1), p(9, 10)]);
  });

  it('mitres an outer (convex) corner', () => {
    const offset = offsetPolyline([p(0, 0), p(10, 0), p(10, -10)], 1);

    expect(offset).toEqual([p(0, 1), p(11, 1), p(11, -10)]);
  });

  it('rounds a convex corner with arc points', () => {
    const offset = offsetPolyline([p(0, 0), p(10, 0), p(10, -10)], 1, { join: 'round' });

    expect(offset.length).toBeGreaterThan(3);
    expect(offset[0]).toEqual(p(0, 1));
    expect(offset[1]).toEqual(p(10, 1));
    expect(offset[offset.length - 1]).toEqual(p(11, -10));
    for (const vertex of offset.slice(1, -1)) {
      expect(Math.hypot(vertex.x - 10, vertex.y - 0)).toBeCloseTo(1, 9);
    }
  });

  it('does not round a concave corner', () => {
    const offset = offsetPolyline([p(0, 0), p(10, 0), p(10, 10)], 1, { join: 'round' });

    expect(offset).toEqual([p(0, 1), p(9, 1), p(9, 10)]);
  });

  it('emits no arc points for a shallow convex corner (single-step arc)', () => {
    const offset = offsetPolyline([p(0, 0), p(20, 0), p(30, -0.1)], 1, { join: 'round' });

    expect(offset).toHaveLength(4);
    expect(offset[0]).toEqual(p(0, 1));
    expect(offset[1]).toEqual(p(20, 1));
    expect(offset[2].x).toBeCloseTo(20.01, 3);
  });

  it('bevels when the miter exceeds the limit', () => {
    const offset = offsetPolyline([p(0, 0), p(10, 0), p(10, -10)], 1, { miterLimit: 0.5 });

    expect(offset).toEqual([p(0, 1), p(10, 1), p(11, 0), p(11, -10)]);
  });

  it('offsets a closed loop with mitred corners', () => {
    const offset = offsetPolyline([p(0, 0), p(10, 0), p(10, 10), p(0, 10)], 1, { closed: true });

    expect(offset).toEqual([p(1, 1), p(9, 1), p(9, 9), p(1, 9)]);
  });
});

describe('findSelfIntersections', () => {
  it('returns nothing for a simple open path', () => {
    expect(findSelfIntersections([p(0, 0), p(10, 0), p(10, 10)])).toEqual([]);
  });

  it('ignores parallel segments that never cross', () => {
    expect(findSelfIntersections([p(0, 0), p(10, 0), p(10, 10), p(0, 10)])).toEqual([]);
  });

  it('finds a crossing between non-adjacent segments', () => {
    const intersections = findSelfIntersections([p(0, 0), p(10, 10), p(10, 0), p(0, 10)]);

    expect(intersections).toHaveLength(1);
    expect(intersections[0]).toMatchObject({ first: 0, second: 2 });
    expect(intersections[0]!.point).toEqual(p(5, 5));
  });

  it('reports no intersection when a crossing lies outside a segment', () => {
    expect(findSelfIntersections([p(0, 0), p(2, 0), p(1, 1), p(3, 3)])).toEqual([]);
  });

  it('skips the wrap-around pair in a closed loop', () => {
    expect(
      findSelfIntersections([p(0, 0), p(10, 0), p(10, 10), p(0, 10)], { closed: true }),
    ).toEqual([]);
  });

  it('finds a crossing in a closed bowtie loop', () => {
    const intersections = findSelfIntersections([p(0, 0), p(10, 10), p(10, 0), p(0, 10)], {
      closed: true,
    });

    expect(intersections.length).toBeGreaterThan(0);
  });
});

describe('cubicPoint and curvePoints', () => {
  it('evaluates the cubic endpoints', () => {
    const p0 = p(0, 0);
    const p1 = p(1, 0);
    const p2 = p(2, 1);
    const p3 = p(3, 1);

    expect(cubicPoint(p0, p1, p2, p3, 0)).toEqual(p0);
    expect(cubicPoint(p0, p1, p2, p3, 1)).toEqual(p3);
  });

  it('flattens a curve into segments + 1 points', () => {
    const flattened = curvePoints(p(0, 0), p(0, 1), p(1, 1), p(1, 0), 4);

    expect(flattened).toHaveLength(5);
    expect(flattened[0]).toEqual(p(0, 0));
    expect(flattened[4]).toEqual(p(1, 0));
  });
});

describe('edgePolyline', () => {
  it('returns null for a missing or point entity', () => {
    const document = documentOf([point('a', 0, 0)]);

    expect(edgePolyline(document, 'missing')).toBeNull();
    expect(edgePolyline(document, 'a')).toBeNull();
  });

  it('flattens a line to its two endpoints', () => {
    const document = documentOf([point('a', 0, 0), point('b', 10, 5), line('l', 'a', 'b')]);

    expect(edgePolyline(document, 'l')).toEqual([p(0, 0), p(10, 5)]);
  });

  it('flattens a curve to sampled points', () => {
    const curve: CurveEntity = {
      id: 'curve',
      kind: 'curve',
      p0: 'a',
      p1: 'b',
      p2: 'c',
      p3: 'd',
      construction: false,
    };
    const document = documentOf(
      [point('a', 0, 0), point('b', 0, 1), point('c', 1, 1), point('d', 1, 0), curve],
      [],
    );

    expect(edgePolyline(document, 'curve', 2)).toHaveLength(3);
  });
});

describe('seamAllowancePath', () => {
  const document = documentOf(
    [point('a', 0, 0), point('b', 10, 0), line('l', 'a', 'b')],
    [{ id: 's', edge: 'l', width: 1 }],
  );

  it('offsets a seam edge and reports no self-intersections', () => {
    const result = seamAllowancePath(document, { id: 's', edge: 'l', width: 1 });

    expect(result).toMatchObject({ edge: 'l', width: 1, side: 'left', join: 'miter' });
    expect(result?.path).toEqual([p(0, 1), p(10, 1)]);
    expect(result?.selfIntersections).toEqual([]);
  });

  it('mirrors the offset to the edge-relative right side', () => {
    const result = seamAllowancePath(document, { id: 's', edge: 'l', width: 1, side: 'right' });

    expect(result).toMatchObject({ edge: 'l', width: 1, side: 'right' });
    expect(result?.path).toEqual([p(0, -1), p(10, -1)]);
  });

  it('flips a curve allowance to the other side of its flattened edge', () => {
    const curveDocument = documentOf(
      [
        point('a', 0, 0),
        point('b', 0, 1),
        point('c', 1, 1),
        point('d', 1, 0),
        {
          id: 'curve',
          kind: 'curve',
          p0: 'a',
          p1: 'b',
          p2: 'c',
          p3: 'd',
          construction: false,
        },
      ],
      [],
    );

    const left = seamAllowancePath(curveDocument, { id: 's', edge: 'curve', width: 0.1 });
    const right = seamAllowancePath(curveDocument, {
      id: 's',
      edge: 'curve',
      width: 0.1,
      side: 'right',
    });

    expect(left?.path[0]!.y).toBeGreaterThan(0);
    expect(right?.path[0]!.y).toBeLessThan(0);
  });

  it('returns null when the edge is missing', () => {
    expect(seamAllowancePath(document, { id: 's', edge: 'missing', width: 1 })).toBeNull();
  });

  it('honours a round join option', () => {
    const roundDocument = documentOf(
      [
        point('a', 0, 0),
        point('b', 10, 0),
        point('c', 10, -10),
        line('l', 'a', 'b'),
        line('m', 'b', 'c'),
      ],
      [],
    );

    const result = seamAllowancePath(
      roundDocument,
      { id: 's', edge: 'l', width: 1 },
      { join: 'round' },
    );

    expect(result?.join).toBe('round');
  });
});

describe('seamAllowancePaths', () => {
  it('maps every valid seam and skips ones with a missing edge', () => {
    const document = documentOf(
      [point('a', 0, 0), point('b', 10, 0), line('l', 'a', 'b')],
      [
        { id: 'good', edge: 'l', width: 2 },
        { id: 'bad', edge: 'missing', width: 2 },
      ],
    );

    const paths = seamAllowancePaths(document);

    expect(paths).toHaveLength(1);
    expect(paths[0]!.edge).toBe('l');
  });
});
