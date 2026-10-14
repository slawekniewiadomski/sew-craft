import { distance, type Vec2 } from '@sewcraft/geometry';

export const GRID_STEP = 10;
export const POINT_SNAP_TOLERANCE = 6;

export interface SnapOptions {
  gridStep?: number;
  pointTolerance?: number;
}

export function snapToGrid(point: Vec2, step: number = GRID_STEP): Vec2 {
  return {
    x: Math.round(point.x / step) * step,
    y: Math.round(point.y / step) * step,
  };
}

/** The candidate closest to `point` within `tolerance`, or `null` for none. */
export function nearestPoint(
  point: Vec2,
  candidates: Vec2[],
  tolerance: number = POINT_SNAP_TOLERANCE,
): Vec2 | null {
  let nearest: Vec2 | null = null;
  let nearestDistance = tolerance;

  for (const candidate of candidates) {
    const candidateDistance = distance(point, candidate);
    if (candidateDistance <= nearestDistance) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }

  return nearest;
}

/**
 * Snap to a nearby point first (points win over the grid), otherwise to the
 * nearest grid intersection. Pure frontend concern — see geometry-core.md.
 */
export function snapPoint(point: Vec2, candidates: Vec2[], options: SnapOptions = {}): Vec2 {
  const nearest = nearestPoint(point, candidates, options.pointTolerance);
  return nearest ?? snapToGrid(point, options.gridStep);
}
