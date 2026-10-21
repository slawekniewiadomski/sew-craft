import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  entitiesInRect,
  type CircleEntity,
  type CurveEntity,
  type ArcEntity,
  type Entity,
  type LineEntity,
  type PatternDocument,
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
