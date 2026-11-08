import { arcPoints as flattenArc, arcThroughPoints } from './arc.js';
import { entityPoints, getEntity } from './document.js';
import { FLATTEN_SEGMENTS } from './flatten.js';
import type { EntityId, PatternDocument } from './types.js';
import type { Vec2 } from './vector.js';

export function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Flatten a cubic Bézier into `segments + 1` points, inclusive of both ends. */
export function curvePoints(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  segments: number = FLATTEN_SEGMENTS,
): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i <= segments; i += 1) {
    points.push(cubicPoint(p0, p1, p2, p3, i / segments));
  }
  return points;
}

/**
 * The polyline a cut edge traces. Lines are two points; curves and arcs are
 * flattened to `segments` intervals. Returns `null` when the id is missing, is a
 * point, or is an arc that has become degenerate.
 */
export function edgePolyline(
  document: PatternDocument,
  edge: EntityId,
  segments: number = FLATTEN_SEGMENTS,
): Vec2[] | null {
  const entity = getEntity(document, edge);
  if (entity === undefined || entity.kind === 'point' || entity.kind === 'circle') {
    return null;
  }

  const referenced = entityPoints(document, entity).map((point) => ({ x: point.x, y: point.y }));
  if (entity.kind === 'line') {
    return referenced;
  }

  if (entity.kind === 'arc') {
    const geometry = arcThroughPoints(referenced[0]!, referenced[2]!, referenced[1]!);
    return geometry === null
      ? null
      : flattenArc(geometry, referenced[0]!, referenced[2]!, segments);
  }

  return curvePoints(referenced[0]!, referenced[1]!, referenced[2]!, referenced[3]!, segments);
}
