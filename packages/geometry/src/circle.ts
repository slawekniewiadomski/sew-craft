import { getEntity } from './document.js';
import type { CircleEntity, PatternDocument } from './types.js';
import type { Vec2 } from './vector.js';

/** Smallest radius a circle may have and still count as renderable geometry. */
export const MIN_RADIUS = 0.001;

export interface CircleGeometry {
  center: Vec2;
  rim: Vec2;
  radius: number;
}

/**
 * Resolve a circle's centre, rim point and radius. Returns `null` when either
 * reference is missing or is not a point, or when the radius is below
 * {@link MIN_RADIUS} (a degenerate circle is not renderable geometry).
 */
export function circleGeometry(
  document: PatternDocument,
  circle: CircleEntity,
): CircleGeometry | null {
  const center = getEntity(document, circle.center);
  const rim = getEntity(document, circle.rim);
  if (center === undefined || rim === undefined) return null;
  if (center.kind !== 'point' || rim.kind !== 'point') return null;

  const radius = Math.hypot(rim.x - center.x, rim.y - center.y);
  if (!Number.isFinite(radius) || radius < MIN_RADIUS) return null;

  return {
    center: { x: center.x, y: center.y },
    rim: { x: rim.x, y: rim.y },
    radius,
  };
}

/**
 * A closed polyline approximation of a circle, without a repeated closing
 * point. Used by consumers that flatten edges (offset, tests) rather than draw.
 */
export function circlePoints(center: Vec2, radius: number, segments = 64): Vec2[] {
  const points: Vec2[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (2 * Math.PI * index) / segments;
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  return points;
}
