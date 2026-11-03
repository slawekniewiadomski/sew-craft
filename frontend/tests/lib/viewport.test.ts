import type { Bounds } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  clampScale,
  fitToBounds,
  MAX_SCALE,
  MIN_SCALE,
  niceStep,
  panBy,
  screenToWorld,
  ticksAlong,
  viewportTransform,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
  type Rect,
  type Viewport,
} from '@/lib/viewport';

const viewport: Viewport = { x: 10, y: 20, scale: 2 };

describe('clampScale', () => {
  it('keeps a scale within the allowed range', () => {
    expect(clampScale(1)).toBe(1);
    expect(clampScale(0.001)).toBe(MIN_SCALE);
    expect(clampScale(1000)).toBe(MAX_SCALE);
  });
});

describe('worldToScreen / screenToWorld', () => {
  it('round-trips a point', () => {
    const screen = worldToScreen(viewport, { x: 30, y: 60 });
    expect(screen).toEqual({ x: 40, y: 80 });
    expect(screenToWorld(viewport, screen)).toEqual({ x: 30, y: 60 });
  });
});

describe('panBy', () => {
  it('moves the origin opposite to the drag', () => {
    expect(panBy(viewport, 20, -40)).toEqual({ x: 0, y: 40, scale: 2 });
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the anchor fixed', () => {
    const anchor = { x: 40, y: 80 };
    const before = screenToWorld(viewport, anchor);
    const zoomed = zoomAt(viewport, anchor, 2);
    expect(zoomed.scale).toBe(4);
    expect(screenToWorld(zoomed, anchor)).toEqual(before);
  });

  it('clamps the scale', () => {
    expect(zoomAt(viewport, { x: 0, y: 0 }, 1000).scale).toBe(MAX_SCALE);
  });
});

describe('visibleWorldRect', () => {
  it('returns the world rectangle under the canvas', () => {
    expect(visibleWorldRect(viewport, { width: 100, height: 50 })).toEqual({
      min: { x: 10, y: 20 },
      max: { x: 60, y: 45 },
    });
  });
});

describe('fitToBounds', () => {
  const bounds: Bounds = { min: { x: 0, y: 0 }, max: { x: 100, y: 50 } };

  it('fits a rectangle into the canvas with padding', () => {
    const fitted = fitToBounds(bounds, { width: 800, height: 600 }, 24);

    expect(fitted.scale).toBeCloseTo(7.52, 6);
    expect(worldToScreen(fitted, bounds.min).x).toBeGreaterThanOrEqual(0);
    expect(worldToScreen(fitted, bounds.max).x).toBeLessThanOrEqual(800);
    expect(worldToScreen(fitted, bounds.max).y).toBeLessThanOrEqual(600);
  });

  it('fits a vertical line (zero width) by its height', () => {
    const fitted = fitToBounds(
      { min: { x: 10, y: 0 }, max: { x: 10, y: 50 } },
      {
        width: 800,
        height: 600,
      },
    );

    expect(fitted.scale).toBeCloseTo(11.04, 6);
  });

  it('fits a horizontal line (zero height) by its width', () => {
    const fitted = fitToBounds(
      { min: { x: 0, y: 0 }, max: { x: 100, y: 0 } },
      {
        width: 800,
        height: 600,
      },
    );

    expect(fitted.scale).toBeCloseTo(7.52, 6);
  });

  it('zooms fully in for a single point', () => {
    const fitted = fitToBounds(
      { min: { x: 5, y: 5 }, max: { x: 5, y: 5 } },
      {
        width: 800,
        height: 600,
      },
    );

    expect(fitted.scale).toBe(MAX_SCALE);
  });

  it('never lets the available area collapse, clamping to the minimum scale', () => {
    const fitted = fitToBounds(bounds, { width: 10, height: 10 }, 24);

    expect(fitted.scale).toBe(MIN_SCALE);
  });
});

describe('viewportTransform', () => {
  it('builds a translate + scale transform', () => {
    expect(viewportTransform(viewport)).toBe('translate(-20 -40) scale(2)');
  });
});

describe('niceStep', () => {
  it('picks 1/2/5 × 10ⁿ steps', () => {
    expect(niceStep(64, 64)).toBe(1);
    expect(niceStep(32, 64)).toBe(2);
    expect(niceStep(12.8, 64)).toBe(5);
    expect(niceStep(0.5, 64)).toBe(200);
  });

  it('falls through to the next power of ten beyond 5×', () => {
    expect(niceStep(8, 64)).toBe(10);
  });
});

describe('ticksAlong', () => {
  const rect: Rect = { min: { x: 0, y: 0 }, max: { x: 25, y: 15 } };

  it('lists multiples of the step on the x axis', () => {
    expect(ticksAlong(rect, 'x', 10)).toEqual([0, 10, 20]);
  });

  it('lists multiples of the step on the y axis', () => {
    expect(ticksAlong(rect, 'y', 10)).toEqual([0, 10]);
  });
});
