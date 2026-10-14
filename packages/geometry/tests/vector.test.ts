import { describe, expect, it } from 'vitest';

import {
  add,
  cross,
  distance,
  dot,
  equals,
  magnitude,
  normalize,
  scale,
  sub,
  vec,
} from '../src/index.js';

describe('vector', () => {
  it('builds a vector', () => {
    expect(vec(2, -3)).toEqual({ x: 2, y: -3 });
  });

  it('adds and subtracts', () => {
    expect(add(vec(1, 2), vec(3, 4))).toEqual({ x: 4, y: 6 });
    expect(sub(vec(3, 4), vec(1, 2))).toEqual({ x: 2, y: 2 });
  });

  it('scales', () => {
    expect(scale(vec(2, -3), 2)).toEqual({ x: 4, y: -6 });
  });

  it('computes dot and cross products', () => {
    expect(dot(vec(1, 2), vec(3, 4))).toBe(11);
    expect(cross(vec(1, 2), vec(3, 4))).toBe(-2);
  });

  it('computes magnitude and distance', () => {
    expect(magnitude(vec(3, 4))).toBe(5);
    expect(distance(vec(0, 0), vec(3, 4))).toBe(5);
  });

  it('normalizes a vector to unit length', () => {
    const unit = normalize(vec(3, 4));
    expect(unit.x).toBeCloseTo(0.6, 12);
    expect(unit.y).toBeCloseTo(0.8, 12);
  });

  it('normalizes the zero vector to zero', () => {
    expect(normalize(vec(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it('compares vectors within the default tolerance', () => {
    expect(equals(vec(1, 1), vec(1, 1))).toBe(true);
    expect(equals(vec(1, 1), vec(1.001, 1))).toBe(false);
  });

  it('honours a custom tolerance', () => {
    expect(equals(vec(1, 1), vec(1.1, 1), 0.2)).toBe(true);
  });
});
