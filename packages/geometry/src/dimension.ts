import { getEntity } from './document.js';
import type {
  DimensionOrientation,
  DistanceConstraint,
  EntityId,
  PatternDocument,
  PointEntity,
} from './types.js';
import { add, dot, magnitude, normalize, scale, sub, type Vec2 } from './vector.js';

/** Default signed offset of a placed dimension line, in millimetres. */
export const DEFAULT_DIMENSION_OFFSET = 20;
/** Gap between a measured point and the start of its extension line. */
export const DIMENSION_EXTENSION_GAP = 1.5;
/** How far an extension line runs past the dimension line. */
export const DIMENSION_EXTENSION_OVERSHOOT = 2;
/** Arm length of the chevron drawn at each end of the dimension line. */
export const DIMENSION_CHEVRON_LENGTH = 3;
/** Half-angle between the two arms of a chevron, in radians. */
export const DIMENSION_CHEVRON_ANGLE = Math.PI / 6;
/** Gap between the dimension line and the value label. */
export const DIMENSION_LABEL_GAP = 2.5;
/** Spans within this many millimetres of an axis are treated as axis-aligned. */
const AXIS_TOLERANCE = 0.5;

export interface DimensionExtension {
  start: Vec2;
  end: Vec2;
}

export interface DimensionChevron {
  tip: Vec2;
  armA: Vec2;
  armB: Vec2;
}

export interface DimensionLabel {
  position: Vec2;
  angleDegrees: number;
}

export interface DimensionLayout {
  a: Vec2;
  b: Vec2;
  dimensionStart: Vec2;
  dimensionEnd: Vec2;
  extensions: DimensionExtension[];
  chevrons: DimensionChevron[];
  label: DimensionLabel;
}

interface BaseLayout {
  dimensionStart: Vec2;
  dimensionEnd: Vec2;
  extensions: DimensionExtension[];
  labelNormal: Vec2;
}

/** A point by id, or `null` when the reference is missing or not a point. */
function pointById(document: PatternDocument, id: EntityId): PointEntity | null {
  const entity = getEntity(document, id);
  return entity !== undefined && entity.kind === 'point' ? entity : null;
}

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

/** The measurement axis of a distance constraint; omitted means `aligned`. */
export function constraintOrientation(constraint: DistanceConstraint): DimensionOrientation {
  return constraint.orientation ?? 'aligned';
}

/** The effective placement offset, falling back to the default. */
export function constraintOffset(constraint: DistanceConstraint): number {
  return constraint.offset ?? DEFAULT_DIMENSION_OFFSET;
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
  const span = resolveSpan(document, a, b);
  if (span === null) return 'aligned';

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
  const span = resolveSpan(document, a, b);
  if (span === null) return DEFAULT_DIMENSION_OFFSET;

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

function verticalExtension(point: Vec2, dimensionY: number): DimensionExtension {
  const direction = Math.sign(dimensionY - point.y);
  if (direction === 0) return { start: point, end: point };
  return {
    start: { x: point.x, y: point.y + direction * DIMENSION_EXTENSION_GAP },
    end: { x: point.x, y: dimensionY + direction * DIMENSION_EXTENSION_OVERSHOOT },
  };
}

function horizontalExtension(point: Vec2, dimensionX: number): DimensionExtension {
  const direction = Math.sign(dimensionX - point.x);
  if (direction === 0) return { start: point, end: point };
  return {
    start: { x: point.x + direction * DIMENSION_EXTENSION_GAP, y: point.y },
    end: { x: dimensionX + direction * DIMENSION_EXTENSION_OVERSHOOT, y: point.y },
  };
}

function horizontalLayout(a: Vec2, b: Vec2, offset: number): BaseLayout | null {
  if (b.x === a.x) return null;
  const y = (a.y + b.y) / 2 + offset;
  return {
    dimensionStart: { x: a.x, y },
    dimensionEnd: { x: b.x, y },
    extensions: [verticalExtension(a, y), verticalExtension(b, y)],
    labelNormal: { x: 0, y: offset >= 0 ? 1 : -1 },
  };
}

function verticalLayout(a: Vec2, b: Vec2, offset: number): BaseLayout | null {
  if (b.y === a.y) return null;
  const x = (a.x + b.x) / 2 + offset;
  return {
    dimensionStart: { x, y: a.y },
    dimensionEnd: { x, y: b.y },
    extensions: [horizontalExtension(a, x), horizontalExtension(b, x)],
    labelNormal: { x: offset >= 0 ? 1 : -1, y: 0 },
  };
}

function alignedExtension(
  point: Vec2,
  normal: Vec2,
  offset: number,
  direction: number,
): DimensionExtension {
  return {
    start: add(point, scale(normal, direction * DIMENSION_EXTENSION_GAP)),
    end: add(point, scale(normal, offset + direction * DIMENSION_EXTENSION_OVERSHOOT)),
  };
}

function alignedLayout(a: Vec2, b: Vec2, offset: number): BaseLayout | null {
  const direction = normalize(sub(b, a));
  if (direction.x === 0 && direction.y === 0) return null;

  const normal = { x: -direction.y, y: direction.x };
  const sign = offset >= 0 ? 1 : -1;
  return {
    dimensionStart: add(a, scale(normal, offset)),
    dimensionEnd: add(b, scale(normal, offset)),
    extensions: [
      alignedExtension(a, normal, offset, sign),
      alignedExtension(b, normal, offset, sign),
    ],
    labelNormal: scale(normal, sign),
  };
}

function rotate(vector: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

function chevronAt(tip: Vec2, direction: Vec2): DimensionChevron {
  const reach = scale(direction, DIMENSION_CHEVRON_LENGTH);
  return {
    tip,
    armA: add(tip, rotate(reach, DIMENSION_CHEVRON_ANGLE)),
    armB: add(tip, rotate(reach, -DIMENSION_CHEVRON_ANGLE)),
  };
}

function chevronsFor(start: Vec2, end: Vec2): DimensionChevron[] {
  // Layouts reject degenerate spans, so the dimension line always has a direction.
  const direction = normalize(sub(end, start));
  return [chevronAt(start, direction), chevronAt(end, scale(direction, -1))];
}

function labelFor(start: Vec2, end: Vec2, normal: Vec2): DimensionLabel {
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  return {
    position: add(mid, scale(normal, DIMENSION_LABEL_GAP)),
    angleDegrees: angle > 90 ? angle - 180 : angle <= -90 ? angle + 180 : angle,
  };
}

/**
 * The full SVG layout of a linear dimension: the dimension line, its extension
 * lines, the chevrons at both ends and the value label anchor. `null` when a
 * referenced point is missing or the measured span is degenerate, so a partially
 * hidden document never renders a bogus annotation.
 */
export function dimensionGeometry(
  document: PatternDocument,
  constraint: DistanceConstraint,
): DimensionLayout | null {
  const span = resolveSpan(document, constraint.a, constraint.b);
  if (span === null) return null;

  const orientation = constraintOrientation(constraint);
  const offset = constraintOffset(constraint);
  const base =
    orientation === 'horizontal'
      ? horizontalLayout(span.a, span.b, offset)
      : orientation === 'vertical'
        ? verticalLayout(span.a, span.b, offset)
        : alignedLayout(span.a, span.b, offset);
  if (base === null) return null;

  return {
    a: span.a,
    b: span.b,
    dimensionStart: base.dimensionStart,
    dimensionEnd: base.dimensionEnd,
    extensions: base.extensions,
    chevrons: chevronsFor(base.dimensionStart, base.dimensionEnd),
    label: labelFor(base.dimensionStart, base.dimensionEnd, base.labelNormal),
  };
}
