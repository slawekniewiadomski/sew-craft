import { describe, expect, it } from 'vitest';

import { GRID_STEP, nearestPoint, snapPoint, snapToGrid } from '@/lib/snap';

describe('snapToGrid', () => {
  it('rounds to the nearest grid intersection', () => {
    expect(snapToGrid({ x: 12, y: 27 }, 10)).toEqual({ x: 10, y: 30 });
    expect(snapToGrid({ x: -6, y: -18 }, 10)).toEqual({ x: -10, y: -20 });
  });

  it('defaults to the configured grid step', () => {
    expect(snapToGrid({ x: GRID_STEP + 4, y: 0 })).toEqual({ x: GRID_STEP, y: 0 });
  });
});

describe('nearestPoint', () => {
  const candidates = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it('returns the closest candidate within tolerance', () => {
    expect(nearestPoint({ x: 3, y: 2 }, candidates, 6)).toEqual({ x: 0, y: 0 });
  });

  it('returns null when nothing is close enough', () => {
    expect(nearestPoint({ x: 50, y: 50 }, candidates, 6)).toBeNull();
  });

  it('prefers the closer of two candidates', () => {
    expect(nearestPoint({ x: 98, y: 1 }, candidates, 6)).toEqual({ x: 100, y: 0 });
  });
});

describe('snapPoint', () => {
  const candidates = [{ x: 40, y: 40 }];

  it('snaps to a nearby point before the grid', () => {
    expect(snapPoint({ x: 42, y: 41 }, candidates, { pointTolerance: 6 })).toEqual({
      x: 40,
      y: 40,
    });
  });

  it('falls back to the grid when no point is near', () => {
    expect(snapPoint({ x: 72, y: 41 }, candidates, { pointTolerance: 6 })).toEqual({
      x: 70,
      y: 40,
    });
  });
});
