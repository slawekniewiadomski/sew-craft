import { describe, expect, it } from 'vitest';

import {
  offsetPolyline,
  offsetVariablePolyline,
  offsetVariablePolylineDetailed,
} from '../src/index.js';

const p = (x: number, y: number) => ({ x, y });

const square = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];

describe('offsetVariablePolylineDetailed', () => {
  it('returns degenerate input unchanged with identity vertices', () => {
    expect(offsetVariablePolylineDetailed([], [])).toEqual({ points: [], vertices: [] });
    expect(offsetVariablePolylineDetailed([p(1, 2)], [])).toEqual({
      points: [p(1, 2)],
      vertices: [{ start: 0, end: 1 }],
    });
    expect(offsetVariablePolylineDetailed(square.slice(0, 2), [1], { closed: true })).toEqual({
      points: square.slice(0, 2),
      vertices: [
        { start: 0, end: 1 },
        { start: 1, end: 2 },
      ],
    });
  });

  it('returns the input unchanged when the distance count does not match', () => {
    expect(offsetVariablePolylineDetailed(square, [1, 1, 1], { closed: true })).toEqual({
      points: square,
      vertices: square.map((_, index) => ({ start: index, end: index + 1 })),
    });
    expect(offsetVariablePolylineDetailed([p(0, 0), p(10, 0), p(10, 10)], [1])).toEqual({
      points: [p(0, 0), p(10, 0), p(10, 10)],
      vertices: [
        { start: 0, end: 1 },
        { start: 1, end: 2 },
        { start: 2, end: 3 },
      ],
    });
  });

  it('returns the input unchanged when every distance is zero', () => {
    expect(offsetVariablePolylineDetailed(square, [0, 0, 0, 0], { closed: true })).toEqual({
      points: square,
      vertices: square.map((_, index) => ({ start: index, end: index + 1 })),
    });
  });

  it('reproduces the uniform offset exactly', () => {
    const detailed = offsetVariablePolylineDetailed(square, [2, 2, 2, 2], { closed: true });
    const uniform = offsetPolyline(square, 2, { closed: true });

    expect(offsetVariablePolyline(square, [2, 2, 2, 2], { closed: true })).toEqual(uniform);
    expect(detailed.vertices).toHaveLength(4);
    expect(detailed.vertices[0]).toEqual({ start: 0, end: 1 });
  });

  it('offsets one open segment and maps both endpoints', () => {
    expect(offsetVariablePolylineDetailed([p(0, 0), p(10, 0)], [1])).toEqual({
      points: [p(0, 1), p(10, 1)],
      vertices: [
        { start: 0, end: 1 },
        { start: 1, end: 2 },
      ],
    });
  });

  it('miters a corner between two different distances', () => {
    const result = offsetVariablePolylineDetailed([p(0, 0), p(10, 0), p(10, 10)], [1, 2]);

    expect(result.points).toEqual([p(0, 1), p(8, 1), p(8, 10)]);
    expect(result.vertices).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
  });

  it('miters a closed corner between two different distances', () => {
    const result = offsetVariablePolylineDetailed(square, [0, 1, 1, 0], { closed: true });

    // The shared bottom edge stays put and the side edges move inward.
    expect(result.points).toEqual([p(0, 0), p(9, 0), p(9, 9), p(0, 9)]);
    expect(result.vertices).toHaveLength(4);
  });

  it('keeps both offset lines when parallel segments offset by different distances', () => {
    const result = offsetVariablePolylineDetailed([p(0, 0), p(10, 0), p(20, 0)], [1, 2]);

    expect(result.points).toEqual([p(0, 1), p(10, 1), p(10, 2), p(20, 2)]);
  });

  it('collapses a parallel corner when both segments share one offset line', () => {
    const result = offsetVariablePolylineDetailed([p(0, 0), p(10, 0), p(20, 0)], [1, 1]);

    expect(result.points).toEqual([p(0, 1), p(10, 1), p(20, 1)]);
  });

  it('bevels a reversal instead of mitring it', () => {
    const result = offsetVariablePolylineDetailed([p(0, 0), p(10, 0), p(0, 0)], [1, 1]);

    expect(result.points).toEqual([p(0, 1), p(10, 1), p(10, -1), p(0, -1)]);
  });

  it('bevels a miter past the limit', () => {
    const result = offsetVariablePolylineDetailed([p(0, 0), p(10, 0), p(0, 1)], [1, 1]);

    expect(result.points).toHaveLength(4);
    expect(result.points[0]).toEqual(p(0, 1));
    expect(result.points[1]).toEqual(p(10, 1));
    expect(result.points[2]!.x).toBeCloseTo(9.9005, 3);
    expect(result.points[2]!.y).toBeCloseTo(-0.995, 3);
    expect(result.points[3]!.x).toBeCloseTo(-0.0995, 3);
    expect(result.points[3]!.y).toBeCloseTo(0.005, 3);
    expect(result.vertices[1]).toEqual({ start: 1, end: 3 });
  });

  it('rounds a convex corner when both distances match', () => {
    const result = offsetVariablePolylineDetailed([p(0, 0), p(10, 0), p(10, 10)], [-1, -1], {
      join: 'round',
    });

    // The incoming point, three intermediate arc points and the outgoing point.
    expect(result.vertices[1]).toEqual({ start: 1, end: 6 });
    expect(result.points[1]).toEqual(p(10, -1));
    expect(result.points[5]!.x).toBeCloseTo(11, 6);
    expect(result.points[5]!.y).toBeCloseTo(0, 6);
  });

  it('does not round a non-convex corner', () => {
    const result = offsetVariablePolylineDetailed([p(0, 0), p(10, 0), p(10, 10)], [1, 1], {
      join: 'round',
    });

    expect(result.vertices[1]).toEqual({ start: 1, end: 2 });
  });

  it('does not round a convex corner whose distances differ', () => {
    const result = offsetVariablePolylineDetailed([p(0, 0), p(10, 0), p(10, 10)], [-1, -2], {
      join: 'round',
    });

    expect(result.vertices[1]).toEqual({ start: 1, end: 2 });
  });

  it('drops a repeated closed point and keeps the segment distance', () => {
    const withDuplicate = [...square, p(0, 0)];
    const closed = offsetVariablePolylineDetailed(withDuplicate, [9, 1, 1, 1, 1], { closed: true });
    const plain = offsetVariablePolylineDetailed(square, [1, 1, 1, 1], { closed: true });

    expect(closed.points).toEqual(plain.points);
    expect(closed.vertices).toHaveLength(4);
  });

  it('drops a zero-length segment and keeps the surviving distance', () => {
    const withDuplicate = [p(0, 0), p(0, 0), p(10, 0), p(10, 10), p(0, 10)];
    const closed = offsetVariablePolylineDetailed(withDuplicate, [7, 1, 1, 1, 1], {
      closed: true,
    });
    const plain = offsetVariablePolylineDetailed(square, [1, 1, 1, 1], { closed: true });

    expect(closed.points).toEqual(plain.points);
  });

  it('drops a repeated open point and keeps the segment distance', () => {
    const result = offsetVariablePolylineDetailed([p(0, 0), p(0, 0), p(10, 0)], [1, 1]);

    expect(result.points).toEqual([p(0, 1), p(10, 1)]);
    expect(result.vertices).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
    ]);
  });
});

describe('offsetVariablePolyline', () => {
  it('returns degenerate input unchanged', () => {
    expect(offsetVariablePolyline([], [])).toEqual([]);
    expect(offsetVariablePolyline([p(1, 2)], [])).toEqual([p(1, 2)]);
    expect(offsetVariablePolyline(square, [0, 0, 0, 0], { closed: true })).toEqual(square);
  });

  it('removes duplicate output points', () => {
    // A zero-width distance next to a wide one can repeat the miter at a vertex.
    const result = offsetVariablePolyline(square, [0, 0, 0, 0], { closed: true });
    expect(result).toHaveLength(4);
  });

  it('matches the uniform offset for a closed loop', () => {
    expect(offsetVariablePolyline(square, [2, 2, 2, 2], { closed: true })).toEqual(
      offsetPolyline(square, 2, { closed: true }),
    );
  });
});
