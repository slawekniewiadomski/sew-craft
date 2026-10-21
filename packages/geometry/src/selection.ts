import { arcExtents, arcPoints, arcThroughPoints } from './arc.js';
import { allPoints } from './document.js';
import type { EntityId, PatternDocument, PointEntity } from './types.js';

/** An axis-aligned rectangle in world coordinates, with `min` <= `max`. */
export type Rect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** Crossing selects any overlap; window selects only fully contained entities. */
export type RectMode = 'crossing' | 'window';

type Vec = { x: number; y: number };

/** Inclusive point-in-rectangle, so an entity on the border is inside. */
function pointInRect(point: Vec, rect: Rect): boolean {
  return (
    point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY
  );
}

/** The four corners of the rectangle in drawing order. */
function rectCorners(rect: Rect): Vec[] {
  return [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
  ];
}

/** Project a convex polygon onto an axis, returning its scalar span. */
function project(points: readonly Vec[], axis: Vec): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max];
}

/**
 * Separating-axis overlap test for two convex polygons. Touching counts as an
 * overlap, and a one- or two-point polygon (a degenerate hull) works because a
 * zero-length edge contributes no axis.
 */
function convexOverlap(a: readonly Vec[], b: readonly Vec[]): boolean {
  for (const polygon of [a, b]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index]!;
      const end = polygon[(index + 1) % polygon.length]!;
      const axis = { x: -(end.y - start.y), y: end.x - start.x };
      if (axis.x === 0 && axis.y === 0) continue;

      const [minA, maxA] = project(a, axis);
      const [minB, maxB] = project(b, axis);
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

/** Cross product of `oa` and `ob`, used by the monotone-chain hull. */
function cross(o: Vec, a: Vec, b: Vec): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** The convex hull of four control points, in counter-clockwise order. */
function convexHull(points: readonly Vec[]): Vec[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = sorted.filter(
    (point, index) =>
      index === 0 || point.x !== sorted[index - 1]!.x || point.y !== sorted[index - 1]!.y,
  );
  if (unique.length <= 2) return unique;

  const lower: Vec[] = [];
  for (const point of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Vec[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * The convex hull used for arc hit-testing: the four corners of the arc's
 * bounding box, widened by the arc's cardinal extents. Conservative, matching the
 * curve hull semantics. A degenerate (collinear) arc falls back to the hull of
 * its three points.
 */
function arcHull(start: Vec, through: Vec, end: Vec): Vec[] {
  const geometry = arcThroughPoints(start, end, through);
  if (geometry === null) return convexHull([start, through, end]);

  const samples = [...arcPoints(geometry, start, end), ...arcExtents(geometry)];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of samples) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return rectCorners({ minX, minY, maxX, maxY });
}

/** Resolve an entity's point references, or `null` when one is missing. */
function resolvePoints(
  points: ReadonlyMap<EntityId, PointEntity>,
  ids: readonly EntityId[],
): Vec[] | null {
  const resolved: Vec[] = [];
  for (const id of ids) {
    const point = points.get(id);
    if (point === undefined) return null;
    resolved.push({ x: point.x, y: point.y });
  }
  return resolved;
}

/**
 * Visible entities hit by a rectangle, in document order. A point uses an
 * inclusive coordinate test; a line is the segment between its endpoints; a
 * curve is the convex hull of its four control points; an arc is its bounding
 * box. Passing `window` keeps only entities fully inside, `crossing` keeps
 * anything that overlaps.
 */
export function entitiesInRect(document: PatternDocument, rect: Rect, mode: RectMode): EntityId[] {
  const points = new Map(allPoints(document).map((point) => [point.id, point]));
  const corners = rectCorners(rect);
  const hits: EntityId[] = [];

  for (const entity of document.entities) {
    if (entity.kind === 'point') {
      if (pointInRect(entity, rect)) hits.push(entity.id);
      continue;
    }

    if (entity.kind === 'arc') {
      const resolved = resolvePoints(points, [entity.start, entity.through, entity.end]);
      if (resolved === null) continue;
      const hull = arcHull(resolved[0]!, resolved[1]!, resolved[2]!);
      const hit =
        mode === 'window'
          ? hull.every((point) => pointInRect(point, rect))
          : convexOverlap(hull, corners);
      if (hit) hits.push(entity.id);
      continue;
    }

    const ids =
      entity.kind === 'line'
        ? [entity.start, entity.end]
        : [entity.p0, entity.p1, entity.p2, entity.p3];
    const resolved = resolvePoints(points, ids);
    if (resolved === null) continue;

    const hit =
      mode === 'window'
        ? resolved.every((point) => pointInRect(point, rect))
        : convexOverlap(entity.kind === 'line' ? resolved : convexHull(resolved), corners);
    if (hit) hits.push(entity.id);
  }

  return hits;
}
