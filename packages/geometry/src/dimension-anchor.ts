import { getEntity } from './document.js';
import type {
  DimensionOrientation,
  DistanceConstraint,
  EntityId,
  PatternDocument,
  PointEntity,
} from './types.js';
import { add, cross, dot, magnitude, scale, sub, type Vec2 } from './vector.js';

/** Default signed offset of a placed dimension line, in millimetres. */
export const DEFAULT_DIMENSION_OFFSET = 20;
export function pointById(document: PatternDocument, id: EntityId): PointEntity | null {
  const entity = getEntity(document, id);
  return entity !== undefined && entity.kind === 'point' ? entity : null;
}

/** A straight line's two endpoint positions. */
export interface LineEndpoints {
  start: Vec2;
  end: Vec2;
}

/** One end of a dimension: a point, or a whole straight line. */
export type DimensionAnchorKind = 'point' | 'line';

/** The geometry one anchor resolves to. */
export type DimensionAnchor =
  { kind: 'point'; point: Vec2 } | { kind: 'line'; segment: LineEndpoints };

/** A resolved dimension span and the anchor kinds that produced it. */
export interface DistanceSpan {
  a: Vec2;
  b: Vec2;
  kinds: [DimensionAnchorKind, DimensionAnchorKind];
}

/** Why a pair of anchors cannot become a line-anchored dimension. */
export type DistanceAnchorReason =
  'missing' | 'not-a-line' | 'not-parallel' | 'point-on-line' | 'coincident' | 'zero-length';

/** The shared pick-time verdict for a pair of dimension anchors. */
export interface DistanceAnchorIssue {
  /** `null` when the pair is a valid dimension. */
  reason: DistanceAnchorReason | null;
  span: DistanceSpan | null;
}

/** Spans at or below this length are unresolved rather than a `0` reading. */
const SPAN_EPSILON = 1e-9;
/** Pick-time parallel tolerance: 0.5° between the two line directions. */
const PARALLEL_TOLERANCE = Math.sin((0.5 * Math.PI) / 180);

/** The two endpoint positions of a straight line, or `null` when it cannot resolve. */
export function lineEndpoints(document: PatternDocument, id: EntityId): LineEndpoints | null {
  const entity = getEntity(document, id);
  if (entity === undefined || entity.kind !== 'line') return null;

  const start = pointById(document, entity.start);
  const end = pointById(document, entity.end);
  return start === null || end === null
    ? null
    : { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
}

/**
 * One dimension anchor by id: a point or a whole straight line. Curves, arcs and
 * circles are not anchors in this slice, so they resolve to `null`.
 */
export function resolveAnchor(document: PatternDocument, id: EntityId): DimensionAnchor | null {
  const entity = getEntity(document, id);
  if (entity === undefined) return null;
  if (entity.kind === 'point') return { kind: 'point', point: { x: entity.x, y: entity.y } };
  if (entity.kind !== 'line') return null;

  const segment = lineEndpoints(document, id);
  return segment === null ? null : { kind: 'line', segment };
}

/** True when the id names a straight line, which forces an aligned dimension. */
export function isLineAnchor(document: PatternDocument, id: EntityId): boolean {
  return getEntity(document, id)?.kind === 'line';
}

function unitDirection(segment: LineEndpoints): Vec2 | null {
  const vector = sub(segment.end, segment.start);
  const length = magnitude(vector);
  return length === 0 ? null : scale(vector, 1 / length);
}

function segmentMidpoint(segment: LineEndpoints): Vec2 {
  return { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
}

/**
 * The perpendicular foot of a point on a line's infinite supporting line, or
 * `null` when the segment is degenerate and has no direction.
 */
export function projectPointOnLine(point: Vec2, segment: LineEndpoints): Vec2 | null {
  const unit = unitDirection(segment);
  if (unit === null) return null;
  return add(segment.start, scale(unit, dot(sub(point, segment.start), unit)));
}

/** Whether two line directions are parallel within the pick-time tolerance. */
export function linesAreParallel(a: LineEndpoints, b: LineEndpoints): boolean {
  const unitA = unitDirection(a);
  const unitB = unitDirection(b);
  if (unitA === null || unitB === null) return false;
  return Math.abs(cross(unitA, unitB)) <= PARALLEL_TOLERANCE;
}

/** Span length; the shared zero-span test lives in the public resolvers. */
export function spanLength(span: { a: Vec2; b: Vec2 }): number {
  return Math.hypot(span.b.x - span.a.x, span.b.y - span.a.y);
}

/**
 * The raw span of two resolved anchors. Line → line is canonicalized by entity
 * id, so the stored pick order never changes the value; point ↔ line normalizes
 * to point → foot. `null` only when a line is degenerate.
 */
function spanForAnchors(
  a: DimensionAnchor,
  b: DimensionAnchor,
  aId: EntityId,
  bId: EntityId,
): DistanceSpan | null {
  if (a.kind === 'point' && b.kind === 'point') {
    return { a: a.point, b: b.point, kinds: ['point', 'point'] };
  }

  if (a.kind === 'line' && b.kind === 'line') {
    // Canonical order by entity id: the lower id is the measurement origin.
    const [first, second] = aId <= bId ? [a, b] : [b, a];
    const origin = segmentMidpoint(first.segment);
    const foot = projectPointOnLine(origin, second.segment);
    return foot === null ? null : { a: origin, b: foot, kinds: ['line', 'line'] };
  }

  // After the both-line case, exactly one anchor is a point.
  const pointAnchor = (a.kind === 'point' ? a : b) as { kind: 'point'; point: Vec2 };
  const lineAnchor = (a.kind === 'line' ? a : b) as { kind: 'line'; segment: LineEndpoints };
  const foot = projectPointOnLine(pointAnchor.point, lineAnchor.segment);
  return foot === null ? null : { a: pointAnchor.point, b: foot, kinds: ['point', 'line'] };
}

/** The raw span of two anchor ids, resolving each from the document. */
export function anchorSpan(
  document: PatternDocument,
  aId: EntityId,
  bId: EntityId,
): DistanceSpan | null {
  const a = resolveAnchor(document, aId);
  const b = resolveAnchor(document, bId);
  return a === null || b === null ? null : spanForAnchors(a, b, aId, bId);
}

/** The resolved span of two anchor ids, or `null` when it is missing or zero. */
export function resolveAnchorSpan(
  document: PatternDocument,
  a: EntityId,
  b: EntityId,
): DistanceSpan | null {
  const span = anchorSpan(document, a, b);
  return span === null || spanLength(span) <= SPAN_EPSILON ? null : span;
}

/**
 * The resolved span of a distance constraint. A zero-length span is unresolved,
 * so a dynamic collapse renders nothing instead of a `0` reading.
 */
export function resolveDistanceSpan(
  document: PatternDocument,
  constraint: DistanceConstraint,
): DistanceSpan | null {
  return resolveAnchorSpan(document, constraint.a, constraint.b);
}

/**
 * The shared pick-time verdict for two anchors: a missing entity, an unsupported
 * kind, a degenerate line, a non-parallel pair, a point on the line, or a
 * coincident pair. The command maps reasons to errors and the canvas to hints.
 */
export function distanceAnchorIssue(
  document: PatternDocument,
  a: EntityId,
  b: EntityId,
): DistanceAnchorIssue {
  const entityA = getEntity(document, a);
  const entityB = getEntity(document, b);
  if (entityA === undefined || entityB === undefined) return { reason: 'missing', span: null };

  const anchorA = resolveAnchor(document, a);
  const anchorB = resolveAnchor(document, b);
  if (anchorA === null || anchorB === null) return { reason: 'not-a-line', span: null };

  if (anchorA.kind === 'line' && unitDirection(anchorA.segment) === null) {
    return { reason: 'zero-length', span: null };
  }
  if (anchorB.kind === 'line' && unitDirection(anchorB.segment) === null) {
    return { reason: 'zero-length', span: null };
  }

  // A zero-length line is rejected above, so a resolved pair always has a span.
  const span = spanForAnchors(anchorA, anchorB, a, b)!;

  if (anchorA.kind === 'line' && anchorB.kind === 'line') {
    if (!linesAreParallel(anchorA.segment, anchorB.segment)) {
      return { reason: 'not-parallel', span };
    }
    if (spanLength(span) <= 1e-6) return { reason: 'coincident', span };
    return { reason: null, span };
  }

  if (anchorA.kind !== anchorB.kind && spanLength(span) <= 1e-6) {
    return { reason: 'point-on-line', span };
  }
  return { reason: null, span };
}

/** The measurement axis of a dimension; omitted means `aligned`. */
export function constraintOrientation(constraint: {
  orientation?: DimensionOrientation;
}): DimensionOrientation {
  return constraint.orientation ?? 'aligned';
}

/** The effective placement offset, falling back to the default. */
export function constraintOffset(constraint: { offset?: number }): number {
  return constraint.offset ?? DEFAULT_DIMENSION_OFFSET;
}

/**
 * The states a dimension can be in. `set` and `referenced` drive the sketch, and
 * so does `formula` — a value written as a formula over the document's
 * variables. `driven` measures it; `derived` measures a piece's cut loop and
 * never reaches the solver; `broken` is a reference or formula that no longer
 * resolves and therefore drives nothing.
 */
