import {
  cutAnchorIssue,
  distanceAnchorIssue,
  getEntity,
  lineEndpoints,
  pieceCutVertex,
  pieceLoopVertex,
  type CutAnchor,
  type EntityId,
  type PatternDocument,
  type Piece,
  type Vec2,
} from '@sewcraft/geometry';

import { anchorForEdge, anchorForPoint, pieceOwningEdge, piecesAtPoint } from './pieces';

/** One click the Dimension tool accepts: a point or a whole straight line. */
export interface DimensionPick {
  id: EntityId;
  kind: 'point' | 'line';
}

/** The entity under the pointer, as `hitEntity()` reports it. */
export interface FeedbackHit {
  id: EntityId;
  kind: string;
}

/** The first cut corner, with the piece whose loop it belongs to. */
export interface CutPick {
  piece: Piece;
  anchor: CutAnchor;
}

/** A cut corner that can be the next pick of the current gesture. */
export interface CutPointCandidate extends CutPick {
  /** The entity point under the pointer; `null` for a derived loop corner. */
  pointId: EntityId | null;
  /** The loop-handle key, when the candidate came from a derived corner. */
  key?: string;
}

/** A whole piece edge that would place a cut dimension in one click. */
export interface CutEdgeCandidate {
  piece: Piece;
  edge: EntityId;
}

/** A ghost line from a first pick to the pointer or a snapped candidate. */
export interface PickGhost {
  from: Vec2;
  to: Vec2;
  snapped: boolean;
}

/** Half-length of the tick that marks a line first pick, in millimetres. */
const LINE_TICK = 3;

/**
 * The Dimension pick this hit resolves to, or `null` for a curve, arc, circle,
 * missing entity or degenerate line. The entity decides, not the DOM `kind`.
 */
export function dimensionPickFor(
  document: PatternDocument,
  hit: FeedbackHit | null,
): DimensionPick | null {
  if (hit === null) return null;

  const entity = getEntity(document, hit.id);
  if (entity === undefined) return null;
  if (entity.kind === 'point') return { id: entity.id, kind: 'point' };
  if (entity.kind !== 'line') return null;

  const segment = lineEndpoints(document, entity.id);
  return segment === null ||
    (segment.start.x === segment.end.x && segment.start.y === segment.end.y)
    ? null
    : { id: entity.id, kind: 'line' };
}

/** Whether a hit is an eligible Dimension pick. */
export function isDimensionPick(document: PatternDocument, hit: FeedbackHit | null): boolean {
  return dimensionPickFor(document, hit) !== null;
}

/** Two picks name the same anchor and therefore cannot form a span. */
export function sameDimensionPick(a: DimensionPick, b: DimensionPick): boolean {
  return a.id === b.id && a.kind === b.kind;
}

/**
 * The next-pick candidate under the pointer: any eligible anchor before the
 * first pick, and only a pair the shared anchor rules accept afterwards.
 */
export function dimensionCandidateFor(
  document: PatternDocument,
  hovered: FeedbackHit | null,
  first: DimensionPick | null,
): DimensionPick | null {
  const pick = dimensionPickFor(document, hovered);
  if (pick === null) return null;
  if (first === null) return pick;
  if (sameDimensionPick(first, pick)) return null;
  return distanceAnchorIssue(document, first.id, pick.id).reason === null ? pick : null;
}

/**
 * The cursor-guide position of an anchor: a point's coordinate or a line's
 * midpoint. `null` when the anchor no longer resolves.
 */
export function pickPreviewPosition(
  document: PatternDocument,
  pick: DimensionPick | null,
): Vec2 | null {
  if (pick === null) return null;

  const entity = getEntity(document, pick.id);
  if (entity === undefined) return null;
  if (entity.kind === 'point') return { x: entity.x, y: entity.y };
  if (entity.kind !== 'line') return null;

  const segment = lineEndpoints(document, entity.id);
  return segment === null
    ? null
    : {
        x: (segment.start.x + segment.end.x) / 2,
        y: (segment.start.y + segment.end.y) / 2,
      };
}

/** The perpendicular tick that marks a line first pick at its midpoint. */
export function pickPreviewTick(
  document: PatternDocument,
  pick: DimensionPick | null,
): { start: Vec2; end: Vec2 } | null {
  if (pick === null || pick.kind !== 'line') return null;

  const segment = lineEndpoints(document, pick.id);
  if (segment === null) return null;

  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;

  const mid = {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
  const nx = (-dy / length) * LINE_TICK;
  const ny = (dx / length) * LINE_TICK;
  return {
    start: { x: mid.x - nx, y: mid.y - ny },
    end: { x: mid.x + nx, y: mid.y + ny },
  };
}

/** The dashed ghost from the first pick to the pointer or a snapped candidate. */
export function dimensionGhostFor(
  document: PatternDocument,
  first: DimensionPick | null,
  candidate: DimensionPick | null,
  pointer: Vec2 | null,
): PickGhost | null {
  if (first === null || pointer === null) return null;

  const from = pickPreviewPosition(document, first);
  if (from === null) return null;

  const to = candidate === null ? pointer : pickPreviewPosition(document, candidate);
  return to === null ? null : { from, to, snapped: candidate !== null };
}

/**
 * The cut corner under the pointer. Before a first pick any loop vertex is a
 * candidate; afterwards only another corner of the same piece is.
 */
export function cutPointCandidateFor(
  document: PatternDocument,
  hit: FeedbackHit | null,
  pending: CutPick | null,
): CutPointCandidate | null {
  if (hit === null) return null;

  const pieces = piecesAtPoint(document, hit.id);
  if (pieces.length === 0) return null;

  const piece =
    pending === null ? pieces[0]! : pieces.find((candidate) => candidate.id === pending.piece.id);
  if (piece === undefined) return null;

  // `piecesAtPoint()` only returns pieces whose loop resolves this point.
  const anchor = anchorForPoint(document, piece, hit.id)!;
  if (pending !== null && cutAnchorIssue(document, piece, pending.anchor, anchor).reason !== null) {
    return null;
  }

  return { piece, anchor, pointId: hit.id };
}

/**
 * A derived loop corner under the pointer, validated against a pending pick so
 * only the same piece's corners (and a different anchor) stay candidates.
 */
export function cutLoopCandidateFor(
  document: PatternDocument,
  handle: { key: string; piece: Piece; anchor: CutAnchor },
  pending: CutPick | null,
): CutPointCandidate | null {
  if (
    pending !== null &&
    cutAnchorIssue(document, handle.piece, pending.anchor, handle.anchor).reason !== null
  ) {
    return null;
  }

  return { piece: handle.piece, anchor: handle.anchor, pointId: null, key: handle.key };
}

/** A whole straight piece edge, the one-click cut pick; `null` otherwise. */
export function cutEdgeCandidateFor(
  document: PatternDocument,
  hit: FeedbackHit | null,
): CutEdgeCandidate | null {
  if (hit === null) return null;

  const piece = pieceOwningEdge(document, hit.id);
  if (piece === null || anchorForEdge(document, piece, hit.id) === null) return null;

  return { piece, edge: hit.id };
}

/** The loop preview position of one anchor, or `null` when it is stale. */
export function cutAnchorPreviewPosition(
  document: PatternDocument,
  piece: Piece,
  anchor: CutAnchor,
): Vec2 | null {
  return (anchor.loop ?? 'cut') === 'stitch'
    ? pieceLoopVertex(document, piece, anchor)
    : pieceCutVertex(document, piece, anchor);
}

/** The dashed cut ghost from the first corner to the pointer or a candidate. */
export function cutGhostFor(
  document: PatternDocument,
  pending: CutPick | null,
  candidate: CutPointCandidate | null,
  pointer: Vec2 | null,
): PickGhost | null {
  if (pending === null || pointer === null) return null;

  const from = cutAnchorPreviewPosition(document, pending.piece, pending.anchor);
  if (from === null) return null;

  const to =
    candidate === null
      ? pointer
      : cutAnchorPreviewPosition(document, candidate.piece, candidate.anchor);
  return to === null ? null : { from, to, snapped: candidate !== null };
}
