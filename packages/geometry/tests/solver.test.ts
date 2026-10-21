import { describe, expect, it } from 'vitest';

import { distance, solve, type Constraint, type PointEntity } from '../src/index.js';

const point = (id: string, x: number, y: number, fixed = false): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: false,
  fixed,
});

const TOLERANCE = 1e-6;

describe('solve', () => {
  it('returns the input coordinates when there are no constraints', () => {
    const result = solve([point('a', 1, 2), point('b', 3, 4)], []);

    expect(result.converged).toBe(true);
    expect(result.coordinates.get('a')).toEqual({ x: 1, y: 2 });
    expect(result.coordinates.get('b')).toEqual({ x: 3, y: 4 });
  });

  it('enforces a distance constraint', () => {
    const points = [point('a', 0, 0, true), point('b', 3, 0)];
    const constraints: Constraint[] = [{ id: 'd', type: 'distance', a: 'a', b: 'b', value: 5 }];

    const result = solve(points, constraints);
    const a = result.coordinates.get('a')!;
    const b = result.coordinates.get('b')!;

    expect(result.converged).toBe(true);
    expect(distance(a, b)).toBeCloseTo(5, 6);
  });

  it('enforces a horizontal constraint', () => {
    const points = [point('a', 0, 0, true), point('b', 3, 4)];
    const constraints: Constraint[] = [{ id: 'h', type: 'horizontal', a: 'a', b: 'b' }];

    const result = solve(points, constraints);

    expect(result.coordinates.get('b')!.y).toBeCloseTo(0, 6);
  });

  it('enforces a vertical constraint', () => {
    const points = [point('a', 0, 0, true), point('b', 4, 3)];
    const constraints: Constraint[] = [{ id: 'v', type: 'vertical', a: 'a', b: 'b' }];

    const result = solve(points, constraints);

    expect(result.coordinates.get('b')!.x).toBeCloseTo(0, 6);
  });

  it('merges coincident points', () => {
    const points = [point('a', 0, 0, true), point('b', 2, 3)];
    const constraints: Constraint[] = [{ id: 'c', type: 'coincident', a: 'a', b: 'b' }];

    const result = solve(points, constraints);
    const a = result.coordinates.get('a')!;
    const b = result.coordinates.get('b')!;

    expect(distance(a, b)).toBeCloseTo(0, 9);
  });

  it('places a point on a line', () => {
    const points = [point('a', 0, 0, true), point('b', 4, 0, true), point('p', 2, 5)];
    const constraints: Constraint[] = [
      { id: 'on', type: 'point_on_line', point: 'p', a: 'a', b: 'b' },
    ];

    const result = solve(points, constraints);

    expect(result.coordinates.get('p')!.y).toBeCloseTo(0, 6);
  });

  it('treats a degenerate reference line as a unit normal', () => {
    const points = [point('a', 0, 0), point('b', 0, 0), point('p', 2, 5)];
    const constraints: Constraint[] = [
      { id: 'on', type: 'point_on_line', point: 'p', a: 'a', b: 'b' },
    ];

    const result = solve(points, constraints);

    expect(result.coordinates.get('p')).toEqual({ x: 2, y: 5 });
  });

  it('makes two segment lengths equal', () => {
    const points = [
      point('a', 0, 0, true),
      point('b', 3, 0, true),
      point('c', 0, 1, true),
      point('d', 0, 2),
    ];
    const constraints: Constraint[] = [
      { id: 'e', type: 'equal', a1: 'a', a2: 'b', b1: 'c', b2: 'd' },
    ];

    const result = solve(points, constraints);
    const c = result.coordinates.get('c')!;
    const d = result.coordinates.get('d')!;

    expect(distance(c, d)).toBeCloseTo(3, 6);
  });

  it('enforces an angle constraint', () => {
    const points = [point('a', 1, 0, true), point('b', 0, 0, true), point('c', 1, 1)];
    const constraints: Constraint[] = [
      { id: 'ang', type: 'angle', a: 'a', b: 'b', c: 'c', value: Math.PI / 2 },
    ];

    const result = solve(points, constraints);
    const a = result.coordinates.get('a')!;
    const b = result.coordinates.get('b')!;
    const c = result.coordinates.get('c')!;

    const u = { x: a.x - b.x, y: a.y - b.y };
    const v = { x: c.x - b.x, y: c.y - b.y };
    const angle = Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);

    expect(result.converged).toBe(true);
    expect(Math.abs(angle)).toBeCloseTo(Math.PI / 2, 4);
  });

  it('is within tolerance for the reported residual', () => {
    const points = [point('a', 0, 0, true), point('b', 1, 1)];
    const constraints: Constraint[] = [{ id: 'd', type: 'distance', a: 'a', b: 'b', value: 10 }];

    const result = solve(points, constraints);

    expect(result.residualNorm).toBeLessThanOrEqual(TOLERANCE);
  });

  it('throws when a constraint references an unknown point', () => {
    const constraints: Constraint[] = [
      { id: 'd', type: 'distance', a: 'a', b: 'missing', value: 5 },
    ];

    expect(() => solve([point('a', 0, 0, true)], constraints)).toThrow(/unknown point/i);
  });

  it('reports non-convergence for contradictory constraints', () => {
    const points = [point('a', 0, 0), point('b', 5, 0)];
    const constraints: Constraint[] = [
      { id: 'd1', type: 'distance', a: 'a', b: 'b', value: 10 },
      { id: 'd2', type: 'distance', a: 'a', b: 'b', value: 20 },
    ];

    const result = solve(points, constraints);

    expect(result.converged).toBe(false);
    expect(result.residualNorm).toBeGreaterThan(TOLERANCE);
  });

  it('stops early when the damping factor saturates', () => {
    const points = [point('a', 0, 0), point('b', 5, 0)];
    const constraints: Constraint[] = [
      { id: 'd1', type: 'distance', a: 'a', b: 'b', value: 10 },
      { id: 'd2', type: 'distance', a: 'a', b: 'b', value: 20 },
    ];

    const result = solve(points, constraints, { maxIterations: 1000 });

    expect(result.converged).toBe(false);
    expect(result.iterations).toBeLessThan(1000);
  });

  it('requires partial pivoting for an ill-conditioned axis', () => {
    const points = [point('a', 0, 0, true), point('b', 0.05, 1)];
    const constraints: Constraint[] = [{ id: 'd', type: 'distance', a: 'a', b: 'b', value: 2 }];

    const result = solve(points, constraints);

    expect(result.converged).toBe(true);
    expect(distance(result.coordinates.get('a')!, result.coordinates.get('b')!)).toBeCloseTo(2, 6);
  });

  it('solves a coupled rectangle system', () => {
    const points = [
      point('a', 0, 0, true),
      point('b', 90, 5),
      point('c', 95, 70),
      point('d', 5, 65),
    ];
    const constraints: Constraint[] = [
      { id: 'ab-h', type: 'horizontal', a: 'a', b: 'b' },
      { id: 'bc-v', type: 'vertical', a: 'b', b: 'c' },
      { id: 'cd-h', type: 'horizontal', a: 'c', b: 'd' },
      { id: 'da-v', type: 'vertical', a: 'd', b: 'a' },
      { id: 'width', type: 'distance', a: 'a', b: 'b', value: 100 },
      { id: 'height', type: 'distance', a: 'b', b: 'c', value: 60 },
    ];

    const result = solve(points, constraints);

    expect(result.converged).toBe(true);
    expect(result.coordinates.get('b')!.y).toBeCloseTo(0, 6);
    expect(result.coordinates.get('c')!.x).toBeCloseTo(100, 6);
  });

  it('measures a horizontal distance along the x axis only', () => {
    const points = [point('a', 0, 0, true), point('b', 10, 30)];
    const constraints: Constraint[] = [
      { id: 'd', type: 'distance', a: 'a', b: 'b', value: 40, orientation: 'horizontal' },
    ];

    const result = solve(points, constraints);
    const b = result.coordinates.get('b')!;

    expect(result.converged).toBe(true);
    expect(Math.abs(b.x - result.coordinates.get('a')!.x)).toBeCloseTo(40, 6);
  });

  it('measures a vertical distance along the y axis only', () => {
    const points = [point('a', 0, 0, true), point('b', 40, 10)];
    const constraints: Constraint[] = [
      { id: 'd', type: 'distance', a: 'a', b: 'b', value: 25, orientation: 'vertical' },
    ];

    const result = solve(points, constraints);
    const b = result.coordinates.get('b')!;

    expect(result.converged).toBe(true);
    expect(Math.abs(b.y - result.coordinates.get('a')!.y)).toBeCloseTo(25, 6);
  });

  it('treats an explicit aligned orientation as the Euclidean distance', () => {
    const points = [point('a', 0, 0, true), point('b', 3, 4)];
    const constraints: Constraint[] = [
      { id: 'd', type: 'distance', a: 'a', b: 'b', value: 10, orientation: 'aligned' },
    ];

    const result = solve(points, constraints);

    expect(result.converged).toBe(true);
    expect(distance(result.coordinates.get('a')!, result.coordinates.get('b')!)).toBeCloseTo(10, 6);
  });

  it('leaves geometry untouched and converged for a driven-only document', () => {
    const points = [point('a', 0, 0), point('b', 3, 4)];
    const constraints: Constraint[] = [
      { id: 'd', type: 'distance', a: 'a', b: 'b' },
      { id: 'h', type: 'distance', a: 'a', b: 'b', orientation: 'horizontal', offset: -5 },
    ];

    const result = solve(points, constraints);

    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(0);
    expect(result.residualNorm).toBe(0);
    expect(result.coordinates.get('a')).toEqual({ x: 0, y: 0 });
    expect(result.coordinates.get('b')).toEqual({ x: 3, y: 4 });
  });

  it('ignores a driven dimension beside a driving one', () => {
    const points = [point('a', 0, 0, true), point('b', 3, 0), point('c', 0, 4)];
    const drivingOnly: Constraint[] = [
      { id: 'd', type: 'distance', a: 'a', b: 'b', value: 5 },
      { id: 'e', type: 'vertical', a: 'a', b: 'c' },
    ];
    const withDriven: Constraint[] = [
      ...drivingOnly,
      { id: 'm', type: 'distance', a: 'b', b: 'c', orientation: 'aligned' },
    ];

    const expected = solve(points, drivingOnly);
    const result = solve(points, withDriven);

    expect(result.converged).toBe(true);
    expect(result.coordinates).toEqual(expected.coordinates);
    expect(result.residualNorm).toBeCloseTo(expected.residualNorm, 12);
  });
});

describe('solve with referenced dimensions', () => {
  const span = (result: ReturnType<typeof solve>, a: string, b: string): number =>
    distance(result.coordinates.get(a)!, result.coordinates.get(b)!);

  it('drives a dependent from its source value', () => {
    const points = [
      point('a', 0, 0, true),
      point('b', 3, 0),
      point('c', 0, 10, true),
      point('d', 3, 10),
    ];
    const constraints: Constraint[] = [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 40 },
      { id: 'dependent', type: 'distance', a: 'c', b: 'd', reference: 'source' },
    ];

    const result = solve(points, constraints);

    expect(result.converged).toBe(true);
    expect(span(result, 'a', 'b')).toBeCloseTo(40, 6);
    expect(span(result, 'c', 'd')).toBeCloseTo(40, 6);
  });

  it('resolves a chain once and applies the same value to every member', () => {
    const points = [
      point('a', 0, 0, true),
      point('b', 1, 0),
      point('c', 0, 10, true),
      point('d', 1, 10),
      point('e', 0, 20, true),
      point('f', 1, 20),
    ];
    const constraints: Constraint[] = [
      { id: 'one', type: 'distance', a: 'a', b: 'b', value: 25 },
      { id: 'two', type: 'distance', a: 'c', b: 'd', reference: 'one' },
      { id: 'three', type: 'distance', a: 'e', b: 'f', reference: 'two' },
    ];

    const result = solve(points, constraints);

    expect(result.converged).toBe(true);
    expect(span(result, 'a', 'b')).toBeCloseTo(25, 6);
    expect(span(result, 'c', 'd')).toBeCloseTo(25, 6);
    expect(span(result, 'e', 'f')).toBeCloseTo(25, 6);
  });

  it('adds no residual for a broken reference and stays converged', () => {
    const points = [point('a', 0, 0, true), point('b', 3, 0)];
    const constraints: Constraint[] = [
      {
        id: 'broken',
        type: 'distance',
        a: 'a',
        b: 'b',
        reference: 'missing',
        lastKnownValue: 5,
      },
    ];

    const result = solve(points, constraints);

    expect(result.converged).toBe(true);
    expect(result.residualNorm).toBe(0);
    expect(span(result, 'a', 'b')).toBeCloseTo(3, 6);
  });

  it('treats a cyclic document as broken instead of hanging', () => {
    const points = [point('a', 0, 0, true), point('b', 3, 0)];
    const constraints: Constraint[] = [
      { id: 'one', type: 'distance', a: 'a', b: 'b', reference: 'two' },
      { id: 'two', type: 'distance', a: 'a', b: 'b', reference: 'one' },
    ];

    const result = solve(points, constraints, { maxIterations: 2 });

    expect(result.converged).toBe(true);
    expect(result.residualNorm).toBe(0);
  });
});
