import type {
  DistanceConstraint,
  DimensionOrientation,
  EntityId,
  PatternDocument,
} from './types.js';
import { dot, magnitude, scale, sub, type Vec2 } from './vector.js';
import {
  DEFAULT_DIMENSION_OFFSET,
  constraintOrientation,
  pointById,
  resolveAnchorSpan,
  resolveDistanceSpan,
  spanLength,
} from './dimension-anchor.js';

/** Spans within this many millimetres of an axis are treated as axis-aligned. */
const AXIS_TOLERANCE = 0.5;
function resolveSpan(
  document: PatternDocument,
  a: EntityId,
  b: EntityId,
): { a: Vec2; b: Vec2 } | null {
  const start = pointById(document, a);
  const end = pointById(document, b);
  if (start === null || end === null) return null;
  return { a: { x: start.x, y: start.y }, b: { x: end.x, y: end.y } };
}

/**
 * The measurement a dimension reports: true length for `aligned`, or the
 * absolute axis distance for `horizontal`/`vertical`. `null` when a referenced
 * point is missing.
 */
export function measureLinearDimension(
  document: PatternDocument,
  a: EntityId,
  b: EntityId,
  orientation: DimensionOrientation,
): number | null {
  const span = resolveSpan(document, a, b);
  if (span === null) return null;

  switch (orientation) {
    case 'horizontal':
      return Math.abs(span.b.x - span.a.x);
    case 'vertical':
      return Math.abs(span.b.y - span.a.y);
    case 'aligned':
      return Math.hypot(span.b.x - span.a.x, span.b.y - span.a.y);
  }
}

/**
 * The measurement a dimension reports. A dimension with a line anchor is always
 * aligned (an axis gap between two lines has no single meaning); point-to-point
 * keeps its stored axis.
 */
export function measureDistanceDimension(
  document: PatternDocument,
  constraint: DistanceConstraint,
): number | null {
  const span = resolveDistanceSpan(document, constraint);
  if (span === null) return null;

  if (span.kinds.includes('line')) return spanLength(span);

  switch (constraintOrientation(constraint)) {
    case 'horizontal':
      return Math.abs(span.b.x - span.a.x);
    case 'vertical':
      return Math.abs(span.b.y - span.a.y);
    case 'aligned':
      return spanLength(span);
  }
}

/** The distance constraint connecting two points in either order, if any. */
export function findDistanceConstraint(
  document: PatternDocument,
  a: EntityId,
  b: EntityId,
): DistanceConstraint | undefined {
  return document.constraints.find(
    (constraint): constraint is DistanceConstraint =>
      constraint.type === 'distance' &&
      ((constraint.a === a && constraint.b === b) || (constraint.a === b && constraint.b === a)),
  );
}

/**
 * Pick the measurement axis from where the user is placing the dimension line.
 * Axis-aligned spans keep their axis; a diagonal span stays `aligned` while the
 * pointer is dragged perpendicular to it, otherwise it follows the span's
 * dominant axis. The sidebar can always override the result.
 */
export function inferDimensionOrientation(
  document: PatternDocument,
  a: EntityId,
  b: EntityId,
  pointer: Vec2,
): DimensionOrientation {
  const span = resolveAnchorSpan(document, a, b);
  if (span === null) return 'aligned';
  // A line anchor is always aligned; there is no meaningful axis gap.
  if (span.kinds.includes('line')) return 'aligned';
  return inferOrientationFromSpan(span, pointer);
}

/**
 * The same axis choice for a span that is already resolved, such as a piece's
 * cut loop, which has no point entities to look up.
 */
export function inferOrientationFromSpan(
  span: { a: Vec2; b: Vec2 },
  pointer: Vec2,
): DimensionOrientation {
  const spanVector = sub(span.b, span.a);
  const spanLength = magnitude(spanVector);
  if (spanLength === 0) return 'aligned';

  const spanX = Math.abs(spanVector.x);
  const spanY = Math.abs(spanVector.y);
  if (spanY <= AXIS_TOLERANCE) return 'horizontal';
  if (spanX <= AXIS_TOLERANCE) return 'vertical';

  const unit = scale(spanVector, 1 / spanLength);
  const normal = { x: -unit.y, y: unit.x };
  const mid = { x: (span.a.x + span.b.x) / 2, y: (span.a.y + span.b.y) / 2 };
  const delta = sub(pointer, mid);
  const across = Math.abs(dot(delta, normal));
  const along = Math.abs(dot(delta, unit));
  if (across >= along) return 'aligned';
  return spanX >= spanY ? 'vertical' : 'horizontal';
}

/**
 * The signed offset of a dimension line placed at `pointer`. Horizontal and
 * vertical offsets are measured from the span midpoint; aligned offsets are the
 * signed perpendicular distance from the span.
 */
export function dimensionOffsetForPointer(
  document: PatternDocument,
  a: EntityId,
  b: EntityId,
  orientation: DimensionOrientation,
  pointer: Vec2,
): number {
  const span = resolveAnchorSpan(document, a, b);
  if (span === null) return DEFAULT_DIMENSION_OFFSET;
  const effective = span.kinds.includes('line') ? 'aligned' : orientation;
  return dimensionOffsetFromSpan(span, effective, pointer);
}

/**
 * The signed offset of a dimension line placed at `pointer`, for callers that
 * already resolved the span (a piece's cut loop, which has no point entities).
 */
export function dimensionOffsetFromSpan(
  span: { a: Vec2; b: Vec2 },
  orientation: DimensionOrientation,
  pointer: Vec2,
): number {
  const mid = { x: (span.a.x + span.b.x) / 2, y: (span.a.y + span.b.y) / 2 };
  switch (orientation) {
    case 'horizontal':
      return pointer.y - mid.y;
    case 'vertical':
      return pointer.x - mid.x;
    case 'aligned': {
      const spanVector = sub(span.b, span.a);
      const length = magnitude(spanVector);
      if (length === 0) return DEFAULT_DIMENSION_OFFSET;
      return (
        (-spanVector.y * (pointer.x - span.a.x) + spanVector.x * (pointer.y - span.a.y)) / length
      );
    }
  }
}
