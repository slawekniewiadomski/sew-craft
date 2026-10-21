import { describe, expect, it } from 'vitest';

import {
  arcExtents,
  arcGeometry,
  arcPoints,
  arcThroughPoints,
  createEmptyDocument,
  MIN_BULGE,
  svgArcCommand,
  type ArcEntity,
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

const arc = (
  id: string,
  start: string,
  end: string,
  through: string,
  options: { construction?: boolean } = {},
): ArcEntity => ({
  id,
  kind: 'arc',
  start,
  end,
  through,
  construction: options.construction ?? false,
});

const documentOf = (entities: Entity[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
});

/** A circle of radius 10 around the origin, at `angle` radians in the y-down frame. */
const onCircle = (angle: number): { x: number; y: number } => ({
  x: 10 * Math.cos(angle),
  y: 10 * Math.sin(angle),
});

describe('arcThroughPoints', () => {
  it('derives the circumcircle and the sweep that passes through the through point', () => {
    const geometry = arcThroughPoints({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 });

    expect(geometry).not.toBeNull();
    expect(geometry!.center.x).toBeCloseTo(0);
    expect(geometry!.center.y).toBeCloseTo(0);
    expect(geometry!.radius).toBeCloseTo(10);
    expect(geometry!.startAngle).toBeCloseTo(Math.PI);
    expect(geometry!.endAngle).toBeCloseTo(0);
    expect(geometry!.sweep).toBeCloseTo(-Math.PI);
    expect(geometry!.largeArc).toBe(false);
  });

  it('picks the opposite sweep when the through point flips to the other side', () => {
    const geometry = arcThroughPoints({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -10 });

    expect(geometry!.sweep).toBeCloseTo(Math.PI);
    expect(geometry!.largeArc).toBe(false);
  });

  it('flags a sweep longer than half the circle as a large arc', () => {
    const geometry = arcThroughPoints({ x: 10, y: 0 }, { x: 0, y: 10 }, { x: 0, y: -10 });

    expect(geometry!.sweep).toBeCloseTo((-3 * Math.PI) / 2);
    expect(geometry!.largeArc).toBe(true);
  });

  it('handles every quadrant', () => {
    const quadrants = [
      { start: 0.25, through: 0.5, end: 0.75 },
      { start: Math.PI + 0.25, through: Math.PI + 0.5, end: Math.PI + 0.75 },
      { start: -0.75, through: -0.5, end: -0.25 },
      { start: -Math.PI - 0.75, through: -Math.PI - 0.5, end: -Math.PI - 0.25 },
    ];

    for (const quadrant of quadrants) {
      const geometry = arcThroughPoints(
        onCircle(quadrant.start),
        onCircle(quadrant.end),
        onCircle(quadrant.through),
      );

      expect(geometry).not.toBeNull();
      expect(geometry!.radius).toBeCloseTo(10);
      expect(geometry!.sweep).toBeCloseTo(0.5);
      expect(geometry!.largeArc).toBe(false);
    }
  });

  it('returns null for collinear points, including a sagitta below MIN_BULGE', () => {
    expect(arcThroughPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 })).toBeNull();
    expect(
      arcThroughPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: MIN_BULGE / 2 }),
    ).toBeNull();
  });

  it('returns null when start and end coincide', () => {
    expect(arcThroughPoints({ x: 3, y: 4 }, { x: 3, y: 4 }, { x: 1, y: 1 })).toBeNull();
  });

  it('returns null when a coordinate makes the geometry non-finite', () => {
    expect(
      arcThroughPoints({ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 1, y: 1 }),
    ).toBeNull();
    expect(
      arcThroughPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: Number.NaN, y: 1 }),
    ).toBeNull();
    expect(
      arcThroughPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: Number.MAX_VALUE }),
    ).toBeNull();
  });

  it('returns null when the circumcentre overflows', () => {
    const huge = 1e154;
    const step = 1e140;

    expect(
      arcThroughPoints(
        { x: huge, y: huge },
        { x: huge + step, y: huge },
        { x: huge, y: huge + step },
      ),
    ).toBeNull();
  });
});

describe('arcGeometry', () => {
  it('derives the geometry from the three referenced points', () => {
    const document = documentOf([
      point('s', -10, 0),
      point('e', 10, 0),
      point('t', 0, 10),
      arc('a1', 's', 'e', 't'),
    ]);

    const geometry = arcGeometry(document, arc('a1', 's', 'e', 't'));

    expect(geometry!.center).toEqual({ x: 0, y: 0 });
    expect(geometry!.radius).toBeCloseTo(10);
  });

  it('returns null when a referenced point is missing', () => {
    const document = documentOf([point('s', 0, 0), arc('a1', 's', 'e', 't')]);

    expect(arcGeometry(document, arc('a1', 's', 'e', 't'))).toBeNull();
  });

  it('returns null when a reference does not point at a point entity', () => {
    const line: LineEntity = {
      id: 'l',
      kind: 'line',
      start: 's',
      end: 's',
      construction: false,
    };
    const document = documentOf([point('s', 0, 0), line, arc('a1', 's', 'l', 'l2')]);

    expect(arcGeometry(document, arc('a1', 's', 'l', 'l2'))).toBeNull();
  });

  it('returns null once a constraint solve has flattened the three points', () => {
    const document = documentOf([
      point('s', 0, 0),
      point('e', 10, 0),
      point('t', 5, 0),
      arc('a1', 's', 'e', 't'),
    ]);

    expect(arcGeometry(document, arc('a1', 's', 'e', 't'))).toBeNull();
  });
});

describe('arcPoints', () => {
  it('flattens to segments + 1 points, pinning both exact endpoints', () => {
    const document = documentOf([
      point('s', -10, 0),
      point('e', 10, 0),
      point('t', 0, 10),
      arc('a1', 's', 'e', 't'),
    ]);
    const geometry = arcGeometry(document, arc('a1', 's', 'e', 't'))!;

    const flattened = arcPoints(geometry, { x: -10, y: 0 }, { x: 10, y: 0 }, 4);

    expect(flattened).toHaveLength(5);
    expect(flattened[0]).toEqual({ x: -10, y: 0 });
    expect(flattened[4]).toEqual({ x: 10, y: 0 });
    expect(flattened[2]!.x).toBeCloseTo(0);
    expect(flattened[2]!.y).toBeCloseTo(10);
  });

  it('defaults to the shared flattening resolution', () => {
    const document = documentOf([
      point('s', -10, 0),
      point('e', 10, 0),
      point('t', 0, 10),
      arc('a1', 's', 'e', 't'),
    ]);
    const geometry = arcGeometry(document, arc('a1', 's', 'e', 't'))!;

    expect(arcPoints(geometry, { x: -10, y: 0 }, { x: 10, y: 0 })).toHaveLength(17);
  });

  it('never emits fewer than two points, even for a fractional segment count', () => {
    const document = documentOf([
      point('s', -10, 0),
      point('e', 10, 0),
      point('t', 0, 10),
      arc('a1', 's', 'e', 't'),
    ]);
    const geometry = arcGeometry(document, arc('a1', 's', 'e', 't'))!;

    expect(arcPoints(geometry, { x: -10, y: 0 }, { x: 10, y: 0 }, 0.5)).toHaveLength(2);
  });
});

describe('arcExtents', () => {
  it('returns the cardinal points inside the sweep', () => {
    const geometry = arcThroughPoints({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })!;

    const extents = arcExtents(geometry);

    expect(extents).toHaveLength(3);
    expect(extents.map((extent) => [Math.round(extent.x), Math.round(extent.y)])).toEqual(
      expect.arrayContaining([
        [10, 0],
        [0, 10],
        [-10, 0],
      ]),
    );
  });

  it('reports a cardinal point that lies beyond all three given points', () => {
    const start = onCircle(0.3);
    const end = onCircle(2.8);
    const through = onCircle(1);
    const geometry = arcThroughPoints(start, end, through)!;

    const extents = arcExtents(geometry);

    // The apex (0, 10) is inside the sweep and above every one of the three points.
    expect(extents).toHaveLength(1);
    expect(extents[0]!.x).toBeCloseTo(0);
    expect(extents[0]!.y).toBeCloseTo(10);
    expect(through.y).toBeLessThan(10);
  });

  it('returns nothing when no cardinal point lies on a short sweep', () => {
    const geometry = arcThroughPoints(onCircle(0.3), onCircle(0.6), onCircle(0.45))!;

    expect(arcExtents(geometry)).toEqual([]);
  });
});

describe('svgArcCommand', () => {
  it('emits a single A command with the sweep flag taken from the signed sweep', () => {
    const geometry = arcThroughPoints({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -10 })!;

    expect(svgArcCommand(geometry, { x: -10, y: 0 }, { x: 10, y: 0 })).toBe(
      'M -10 0 A 10 10 0 0 1 10 0',
    );
  });

  it('sets the large-arc flag and the opposite sweep for a long arc', () => {
    const geometry = arcThroughPoints({ x: 10, y: 0 }, { x: 0, y: 10 }, { x: 0, y: -10 })!;

    expect(svgArcCommand(geometry, { x: 10, y: 0 }, { x: 0, y: 10 })).toBe(
      'M 10 0 A 10 10 0 1 0 0 10',
    );
  });

  it('rounds every number to 1e-4 mm for deterministic output', () => {
    const geometry = arcThroughPoints({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0.5 })!;

    expect(svgArcCommand(geometry, { x: 1 / 3, y: 0 }, { x: 2, y: 0 })).toContain('M 0.3333 0');
  });
});
