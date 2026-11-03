import { describe, expect, it } from 'vitest';

import { curvePath, polylinePath } from '@/lib/canvas-render';

describe('curvePath', () => {
  it('serializes four control points to a cubic Bézier', () => {
    expect(
      curvePath([
        { x: 0, y: 0 },
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        { x: 5, y: 6 },
      ]),
    ).toBe('M 0 0 C 1 2 3 4 5 6');
  });
});

describe('polylinePath', () => {
  it('serializes vertices to an open path', () => {
    expect(
      polylinePath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
      ]),
    ).toBe('M 0 0 L 10 0 L 10 5');
  });

  it('returns an empty path for no vertices', () => {
    expect(polylinePath([])).toBe('');
  });
});
