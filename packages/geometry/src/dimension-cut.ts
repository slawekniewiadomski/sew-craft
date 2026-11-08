import type { CutAnchor, DerivedDistanceConstraint, PatternDocument, Piece } from './types.js';
import { getEntity } from './document.js';
import { add, cross, dot, magnitude, normalize, scale, sub, type Vec2 } from './vector.js';
import { pieceById, resolvePieceAnchor, type CutAnchorResolution } from './piece.js';
import { constraintOrientation } from './dimension-anchor.js';
import type { DimensionState } from './dimension-state.js';

/** A cut span at or below this length is a broken measurement, not a zero reading. */
const CUT_SPAN_TOLERANCE = 1e-9;
/** A cut dimension needs a gap above this length to be placeable. */
const CUT_SPAN_MINIMUM = 1e-6;
/** sin(0.5°): the largest cross product of unit directions accepted as parallel. */
const CUT_PARALLEL_TOLERANCE = Math.sin((0.5 * Math.PI) / 180);
function segmentDirection(segment: { a: Vec2; b: Vec2 }): Vec2 {
  return normalize(sub(segment.b, segment.a));
}

/** The perpendicular foot of a point on an edge's infinite cut line. */
function footOnCutLine(point: Vec2, segment: { a: Vec2; b: Vec2 }): Vec2 {
  const direction = segmentDirection(segment);
  return add(segment.a, scale(direction, dot(sub(point, segment.a), direction)));
}

/** The midpoint of an edge's cut segment, the edge anchor's measured point. */
function cutSegmentMidpoint(segment: { a: Vec2; b: Vec2 }): Vec2 {
  return { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 };
}

/** True when either end of a cut dimension is a whole edge. */
export function usesCutEdgeAnchor(constraint: { a: CutAnchor; b: CutAnchor }): boolean {
  return constraint.a.at === 'edge' || constraint.b.at === 'edge';
}

/**
 * The span two resolved anchors measure: two vertices as stored; a vertex and
 * its foot on the edge's cut line (normalized vertex-first); or, for two edges,
 * the canonical first edge's midpoint and its foot on the second cut line.
 * Canonicalizing by piece edge order makes the stored pick order irrelevant.
 */
function spanBetween(
  piece: Piece,
  a: CutAnchor,
  b: CutAnchor,
  resolvedA: CutAnchorResolution,
  resolvedB: CutAnchorResolution,
): { a: Vec2; b: Vec2 } {
  if (resolvedA.kind === 'vertex') {
    if (resolvedB.kind === 'vertex') {
      return { a: resolvedA.point, b: resolvedB.point };
    }
    return { a: resolvedA.point, b: footOnCutLine(resolvedA.point, resolvedB.segment) };
  }

  if (resolvedB.kind === 'vertex') {
    return { a: resolvedB.point, b: footOnCutLine(resolvedB.point, resolvedA.segment) };
  }

  const first = piece.edges.indexOf(a.edge) <= piece.edges.indexOf(b.edge) ? resolvedA : resolvedB;
  const second = first === resolvedA ? resolvedB : resolvedA;
  const midpoint = cutSegmentMidpoint(first.segment);
  return { a: midpoint, b: footOnCutLine(midpoint, second.segment) };
}

/**
 * The span between two anchors of one piece, or `null` when an anchor no longer
 * resolves. Each anchor resolves against the loop it names; a pair that has
 * drifted out of parallel still resolves as the first midpoint measured to the
 * second cut line.
 */
export function resolveCutSpanForAnchors(
  document: PatternDocument,
  piece: Piece,
  a: CutAnchor,
  b: CutAnchor,
): { a: Vec2; b: Vec2 } | null {
  const resolvedA = resolvePieceAnchor(document, piece, a);
  const resolvedB = resolvePieceAnchor(document, piece, b);
  if (resolvedA === null || resolvedB === null) return null;
  return spanBetween(piece, a, b, resolvedA, resolvedB);
}

/**
 * The resolved cut-loop span of a derived dimension, or `null` when its piece or
 * an anchor edge no longer resolves. A span of at most 1e-9 mm also returns
 * `null`, so a dynamic zero span reports broken instead of a `0` reading.
 */
export function resolveCutSpan(
  document: PatternDocument,
  constraint: DerivedDistanceConstraint,
): { a: Vec2; b: Vec2 } | null {
  const piece = pieceById(document, constraint.piece);
  if (piece === undefined) return null;
  const span = resolveCutSpanForAnchors(document, piece, constraint.a, constraint.b);
  if (span === null) return null;
  return magnitude(sub(span.b, span.a)) <= CUT_SPAN_TOLERANCE ? null : span;
}

/** Why two cut anchors cannot form a dimension; `null` when they can. */
export type CutAnchorIssueReason =
  'missing' | 'not-straight' | 'different-piece' | 'same-anchor' | 'not-parallel' | 'zero-span';

/** The shared verdict on a candidate cut-dimension anchor pair. */
export interface CutAnchorIssue {
  /** The rejection, or `null` when the pair is a valid dimension. */
  reason: CutAnchorIssueReason | null;
  /** The resolved span, `null` when an anchor could not be resolved. */
  span: { a: Vec2; b: Vec2 } | null;
}

/**
 * The one predicate behind both the command's validation errors and the canvas
 * hints: whether two anchors can form a cut dimension, and the span they resolve.
 * Edge-to-edge pairs must be parallel at pick time within 0.5° (anti-parallel is
 * accepted); a span of at most 1e-6 mm is rejected as a zero gap.
 */
export function cutAnchorIssue(
  document: PatternDocument,
  piece: Piece,
  a: CutAnchor,
  b: CutAnchor,
): CutAnchorIssue {
  for (const anchor of [a, b]) {
    const entity = getEntity(document, anchor.edge);
    if (entity === undefined) return { reason: 'missing', span: null };
    if (!piece.edges.includes(anchor.edge)) return { reason: 'different-piece', span: null };
    if (anchor.at === 'edge' && entity.kind !== 'line') {
      return { reason: 'not-straight', span: null };
    }
  }

  // The same edge twice, or one of its vertices against the edge itself, is the
  // same anchor by identity; a bevel join makes their cut points differ, so no
  // distance test can stand in for this. A stitch and a cut anchor on one vertex
  // are different measurements, so the loop is part of the identity.
  const sameLoop = (a.loop ?? 'cut') === (b.loop ?? 'cut');
  if (sameLoop && a.edge === b.edge && (a.at === b.at || a.at === 'edge' || b.at === 'edge')) {
    return { reason: 'same-anchor', span: null };
  }

  const resolvedA = resolvePieceAnchor(document, piece, a);
  const resolvedB = resolvePieceAnchor(document, piece, b);
  if (resolvedA === null || resolvedB === null) return { reason: 'missing', span: null };

  if (
    resolvedA.kind === 'edge' &&
    resolvedB.kind === 'edge' &&
    Math.abs(cross(segmentDirection(resolvedA.segment), segmentDirection(resolvedB.segment))) >
      CUT_PARALLEL_TOLERANCE
  ) {
    return { reason: 'not-parallel', span: null };
  }

  const span = spanBetween(piece, a, b, resolvedA, resolvedB);
  if (magnitude(sub(span.b, span.a)) <= CUT_SPAN_MINIMUM) {
    return { reason: 'zero-span', span };
  }
  return { reason: null, span };
}

/** The measurement a derived cut dimension reports for its orientation. */
export function measureCutDimension(
  document: PatternDocument,
  constraint: DerivedDistanceConstraint,
): number | null {
  const span = resolveCutSpan(document, constraint);
  if (span === null) return null;

  const orientation = usesCutEdgeAnchor(constraint) ? 'aligned' : constraintOrientation(constraint);
  switch (orientation) {
    case 'horizontal':
      return Math.abs(span.b.x - span.a.x);
    case 'vertical':
      return Math.abs(span.b.y - span.a.y);
    case 'aligned':
      return Math.hypot(span.b.x - span.a.x, span.b.y - span.a.y);
  }
}

/** A derived dimension is `derived` while it resolves and `broken` when it cannot. */
export function derivedDimensionState(
  document: PatternDocument,
  constraint: DerivedDistanceConstraint,
): Extract<DimensionState, 'derived' | 'broken'> {
  return resolveCutSpan(document, constraint) === null ? 'broken' : 'derived';
}

/**
 * The value a cut dimension reports. A broken anchor can display a stored
 * reading, but v1 never writes one, so it usually shows no number and never
 * becomes an equation.
 */
export function derivedDimensionValue(
  document: PatternDocument,
  constraint: DerivedDistanceConstraint,
): number | null {
  return measureCutDimension(document, constraint) ?? constraint.lastKnownValue ?? null;
}
