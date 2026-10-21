import { getEntity } from './document.js';
import { FLATTEN_SEGMENTS } from './flatten.js';
import { formatSvgNumber } from './number.js';
import type { ArcEntity, EntityId, PatternDocument, PointEntity } from './types.js';
import type { Vec2 } from './vector.js';

/**
 * Smallest perpendicular distance, in millimetres, a `through` point may have
 * from the start→end chord. Closer than this the circumcircle is unusable (the
 * radius blows up), so the arc is treated as collinear and rejected.
 */
export const MIN_BULGE = 0.001;

const TAU = 2 * Math.PI;

/** The cardinal angles, in the document's y-down frame: right, down, left, up. */
const CARDINAL_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const;

export interface ArcGeometry {
  center: Vec2;
  radius: number;
  /** Angles in radians, measured in the document's y-down frame. */
  startAngle: number;
  endAngle: number;
  /** Signed swept angle; negative means the arc runs the other way. */
  sweep: number;
  largeArc: boolean;
}

/** Normalise an angle into `[0, 2π)`. */
function normalizeAngle(angle: number): number {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

/** Twice the signed area of the start→end→through triangle. */
function cross(start: Vec2, end: Vec2, through: Vec2): number {
  return (end.x - start.x) * (through.y - start.y) - (end.y - start.y) * (through.x - start.x);
}

/** Resolve an id to a point entity, or `undefined` when it is not one. */
function pointById(document: PatternDocument, id: EntityId): PointEntity | undefined {
  const entity = getEntity(document, id);
  return entity !== undefined && entity.kind === 'point' ? entity : undefined;
}

/** Whether `angle` lies on the sweep from `startAngle` in the `sweep` direction. */
function angleInSweep(angle: number, startAngle: number, sweep: number): boolean {
  const tolerance = 1e-9;
  return sweep >= 0
    ? normalizeAngle(angle - startAngle) <= sweep + tolerance
    : normalizeAngle(startAngle - angle) <= -sweep + tolerance;
}

/**
 * The circle through three points, with the arc that passes through `through`.
 * Returns `null` when the points are collinear within {@link MIN_BULGE}, when
 * `start` and `end` coincide, or when the geometry is otherwise degenerate.
 *
 * Angles are measured in the document's y-down frame, so a positive `sweep` runs
 * from `start` towards `end` in the direction of increasing `atan2` angle.
 */
export function arcThroughPoints(start: Vec2, end: Vec2, through: Vec2): ArcGeometry | null {
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  if (!Number.isFinite(chord) || chord < MIN_BULGE) return null;

  const area = cross(start, end, through);
  const bulge = Math.abs(area) / chord;
  if (!Number.isFinite(bulge) || bulge < MIN_BULGE) return null;

  // Circumcentre from the perpendicular bisectors; `2 * area` is the determinant.
  const determinant = 2 * area;
  const s2 = start.x * start.x + start.y * start.y;
  const e2 = end.x * end.x + end.y * end.y;
  const t2 = through.x * through.x + through.y * through.y;
  const center: Vec2 = {
    x: (s2 * (end.y - through.y) + e2 * (through.y - start.y) + t2 * (start.y - end.y)) / determinant,
    y: (s2 * (through.x - end.x) + e2 * (start.x - through.x) + t2 * (end.x - start.x)) / determinant,
  };
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(radius)) {
    return null;
  }

  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const throughAngle = Math.atan2(through.y - center.y, through.x - center.x);

  // The arc is the direction that passes through `through`; the other direction
  // would render the complement of the intended sweep.
  const forward = normalizeAngle(endAngle - startAngle);
  const sweep = normalizeAngle(throughAngle - startAngle) < forward ? forward : forward - TAU;

  return { center, radius, startAngle, endAngle, sweep, largeArc: Math.abs(sweep) > Math.PI };
}

/**
 * Resolve an arc's circle, radius, angles and sweep from its three referenced
 * points. Returns `null` when a reference is missing or is not a point, or when
 * the points are collinear (constraint solves can flatten them after creation).
 */
export function arcGeometry(document: PatternDocument, arc: ArcEntity): ArcGeometry | null {
  const start = pointById(document, arc.start);
  const end = pointById(document, arc.end);
  const through = pointById(document, arc.through);
  if (start === undefined || end === undefined || through === undefined) return null;

  return arcThroughPoints(start, end, through);
}

/**
 * Flatten an arc into a polyline from `start` to `end`, including both exact
 * endpoints. Used by seam-allowance offsetting and by tests, never by rendering
 * (which draws the true curve).
 */
export function arcPoints(
  geometry: ArcGeometry,
  start: Vec2,
  end: Vec2,
  segments: number = FLATTEN_SEGMENTS,
): Vec2[] {
  const count = Math.max(1, Math.floor(segments));
  const points: Vec2[] = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = geometry.startAngle + (geometry.sweep * index) / count;
    points.push({
      x: geometry.center.x + Math.cos(angle) * geometry.radius,
      y: geometry.center.y + Math.sin(angle) * geometry.radius,
    });
  }

  points[0] = { x: start.x, y: start.y };
  points[count] = { x: end.x, y: end.y };
  return points;
}

/**
 * The cardinal points the arc actually sweeps through — the extrema that extend
 * beyond its three points. The endpoints themselves are document points and are
 * already covered by the point bounds.
 */
export function arcExtents(geometry: ArcGeometry): Vec2[] {
  const extents: Vec2[] = [];
  for (const angle of CARDINAL_ANGLES) {
    if (!angleInSweep(angle, geometry.startAngle, geometry.sweep)) continue;
    extents.push({
      x: geometry.center.x + Math.cos(angle) * geometry.radius,
      y: geometry.center.y + Math.sin(angle) * geometry.radius,
    });
  }
  return extents;
}

/**
 * The `M … A …` path data that draws this arc from `start` to `end`: a single SVG
 * `A` command whose `large-arc` and `sweep` flags come from the derived geometry,
 * so export and the canvas preview always render the same curve.
 */
export function svgArcCommand(geometry: ArcGeometry, start: Vec2, end: Vec2): string {
  const radius = formatSvgNumber(geometry.radius);
  const largeArc = geometry.largeArc ? 1 : 0;
  const sweep = geometry.sweep > 0 ? 1 : 0;

  return `M ${formatSvgNumber(start.x)} ${formatSvgNumber(start.y)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${formatSvgNumber(end.x)} ${formatSvgNumber(end.y)}`;
}
