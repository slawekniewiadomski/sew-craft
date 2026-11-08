import type {
  DerivedDistanceConstraint,
  DimensionOrientation,
  DistanceConstraint,
  PatternDocument,
} from './types.js';
import { add, normalize, scale, sub, type Vec2 } from './vector.js';
import { anchorSpan, constraintOffset, constraintOrientation } from './dimension-anchor.js';
import { resolveCutSpan, usesCutEdgeAnchor } from './dimension-cut.js';
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

/** The unit direction of a resolved edge's cut segment. */
/** The full SVG layout of a derived cut dimension, reusing the linear layout. */
export function derivedDimensionGeometry(
  document: PatternDocument,
  constraint: DerivedDistanceConstraint,
): DimensionLayout | null {
  const span = resolveCutSpan(document, constraint);
  if (span === null) return null;
  return layoutForSpan(
    span.a,
    span.b,
    usesCutEdgeAnchor(constraint) ? 'aligned' : constraintOrientation(constraint),
    constraintOffset(constraint),
  );
}

function layoutForSpan(
  a: Vec2,
  b: Vec2,
  orientation: DimensionOrientation,
  offset: number,
): DimensionLayout | null {
  const base =
    orientation === 'horizontal'
      ? horizontalLayout(a, b, offset)
      : orientation === 'vertical'
        ? verticalLayout(a, b, offset)
        : alignedLayout(a, b, offset);
  if (base === null) return null;

  return {
    a,
    b,
    dimensionStart: base.dimensionStart,
    dimensionEnd: base.dimensionEnd,
    extensions: base.extensions,
    chevrons: chevronsFor(base.dimensionStart, base.dimensionEnd),
    label: labelFor(base.dimensionStart, base.dimensionEnd, base.labelNormal),
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
  // Deliberately the raw span: the layout helpers already reject a degenerate
  // span, and using them keeps the existing null contract for coincident points.
  const span = anchorSpan(document, constraint.a, constraint.b);
  if (span === null) return null;
  return layoutForSpan(
    span.a,
    span.b,
    span.kinds.includes('line') ? 'aligned' : constraintOrientation(constraint),
    constraintOffset(constraint),
  );
}

export {
  DEFAULT_DIMENSION_OFFSET,
  distanceAnchorIssue,
  constraintOffset,
  constraintOrientation,
  isLineAnchor,
  lineEndpoints,
  linesAreParallel,
  projectPointOnLine,
  resolveAnchor,
  resolveAnchorSpan,
  resolveDistanceSpan,
  type DimensionAnchor,
  type DimensionAnchorKind,
  type DistanceAnchorIssue,
  type DistanceAnchorReason,
  type DistanceSpan,
  type LineEndpoints,
} from './dimension-anchor.js';
export {
  dimensionOffsetForPointer,
  dimensionOffsetFromSpan,
  findDistanceConstraint,
  inferDimensionOrientation,
  inferOrientationFromSpan,
  measureDistanceDimension,
  measureLinearDimension,
} from './dimension-measure.js';
export {
  createsReferenceCycle,
  dimensionState,
  dimensionValue,
  isBrokenDimension,
  isDrivenDimension,
  isReferencedDimension,
  referenceCandidates,
  resolveDimensionValue,
  resolveSetValue,
  type DimensionState,
} from './dimension-state.js';
export {
  cutAnchorIssue,
  derivedDimensionState,
  derivedDimensionValue,
  measureCutDimension,
  resolveCutSpan,
  resolveCutSpanForAnchors,
  usesCutEdgeAnchor,
  type CutAnchorIssue,
  type CutAnchorIssueReason,
} from './dimension-cut.js';
