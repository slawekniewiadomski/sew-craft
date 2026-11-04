import { getEntity } from './document.js';
import { edgePolyline } from './offset.js';
import { allowanceDistance, allowanceForEdge, pieceLoop } from './piece.js';
import { pointInPolygon } from './polygon.js';
import type {
  CentreLineMark,
  EntityId,
  MarkEntity,
  NotchMark,
  PatternDocument,
  Piece,
} from './types.js';
import { magnitude, sub, type Vec2 } from './vector.js';

/** Millimetres within which a notch point counts as lying on its edge. */
export const NOTCH_SNAP_TOLERANCE = 0.01;

/** Half the V's opening, measured along the cut line either side of the point. */
export const NOTCH_HALF_WIDTH = 3;

/** Default share of the allowance a V reaches into; the rest is left as a stem. */
export const DEFAULT_NOTCH_DEPTH = 0.5;

export const MIN_NOTCH_DEPTH = 0.05;
export const MAX_NOTCH_DEPTH = 0.9;

/** Distance the outward-normal probe steps away from the boundary, in millimetres. */
const OUTWARD_PROBE = 0.001;

/** A resolved V: the mouth on the cut line, the tip inside the allowance, the feet. */
export interface NotchGeometry {
  /** The point the V's legs leave from on the cut line; its midpoint. */
  mouth: Vec2;
  /** The deepest point of the V, nearest the stitch line. */
  tip: Vec2;
  /** The two feet on the cut line, opening the V. */
  feet: [Vec2, Vec2];
}

/** A resolved centre line. */
export interface CentreLineGeometry {
  start: Vec2;
  end: Vec2;
}

/** Every mark a piece owns, in document order. */
export function pieceMarks(document: PatternDocument, piece: EntityId): MarkEntity[] {
  return document.entities.filter(
    (entity): entity is MarkEntity => entity.kind === 'mark' && entity.piece === piece,
  );
}

/** One point entity's position, or `null` when the id does not resolve to a point. */
function pointAt(document: PatternDocument, id: EntityId): Vec2 | null {
  const entity = getEntity(document, id);
  return entity !== undefined && entity.kind === 'point' ? { x: entity.x, y: entity.y } : null;
}

interface Projection {
  /** The nearest point on the polyline. */
  point: Vec2;
  /** Unit tangent of the segment it fell on, in polyline order. */
  tangent: Vec2;
  /** Distance from the projected target, in millimetres. */
  distance: number;
}

/** The nearest projection of `target` onto a polyline, or `null` for a degenerate one. */
function projectOnPolyline(polyline: readonly Vec2[], target: Vec2): Projection | null {
  let best: Projection | null = null;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]!;
    const span = sub(polyline[index + 1]!, start);
    const length = magnitude(span);
    if (length === 0) continue;

    const offset = sub(target, start);
    const along = Math.min(
      1,
      Math.max(0, (offset.x * span.x + offset.y * span.y) / (length * length)),
    );
    const point = { x: start.x + span.x * along, y: start.y + span.y * along };
    const distance = magnitude(sub(target, point));
    if (best === null || distance < best.distance) {
      best = { point, tangent: { x: span.x / length, y: span.y / length }, distance };
    }
  }

  return best;
}

/** Where `point` falls on an edge's stitch polyline, or `null` when it is off it. */
export function projectOnEdge(
  document: PatternDocument,
  edge: EntityId,
  point: Vec2,
): Projection | null {
  const polyline = edgePolyline(document, edge);
  if (polyline === null) return null;
  const projection = projectOnPolyline(polyline, point);
  return projection === null || projection.distance > NOTCH_SNAP_TOLERANCE ? null : projection;
}

/** Whether a point sits on an edge within {@link NOTCH_SNAP_TOLERANCE}. */
export function pointOnEdge(document: PatternDocument, edge: EntityId, point: EntityId): boolean {
  const position = pointAt(document, point);
  return position !== null && projectOnEdge(document, edge, position) !== null;
}

/** The share a notch reaches into the allowance, clamped to a visible V. */
export function notchDepthShare(depth: number | undefined): number {
  if (depth === undefined || !Number.isFinite(depth)) return DEFAULT_NOTCH_DEPTH;
  return Math.min(MAX_NOTCH_DEPTH, Math.max(MIN_NOTCH_DEPTH, depth));
}

/**
 * The V a notch draws, resolved on read, or `null` when the mark is broken: its
 * edge left the loop, carries no allowance, or its point no longer lies on the
 * edge. The V opens on the cut line and points back at the stitch line.
 */
export function notchGeometry(
  document: PatternDocument,
  piece: Piece,
  mark: NotchMark,
): NotchGeometry | null {
  if (!piece.edges.includes(mark.edge)) return null;
  const allowance = allowanceForEdge(piece, mark.edge);
  if (allowance === undefined) return null;
  const position = pointAt(document, mark.point);
  if (position === null) return null;

  const projection = projectOnEdge(document, mark.edge, position);
  if (projection === null) return null;

  const loop = pieceLoop(document, piece);
  if (loop === null) return null;

  const distance = allowanceDistance(allowance, document);
  if (distance <= 0) return null;

  // The loop's winding decides which side of the tangent is outside, without
  // having to know whether the edge itself runs with or against the walk.
  const left = { x: -projection.tangent.y, y: projection.tangent.x };
  const probe = {
    x: projection.point.x + left.x * OUTWARD_PROBE,
    y: projection.point.y + left.y * OUTWARD_PROBE,
  };
  const normal = pointInPolygon(loop.points, probe) ? { x: -left.x, y: -left.y } : left;

  const depth = notchDepthShare(mark.depth) * distance;
  const reach = distance - depth;
  const half = {
    x: projection.tangent.x * NOTCH_HALF_WIDTH,
    y: projection.tangent.y * NOTCH_HALF_WIDTH,
  };
  const mouth = {
    x: projection.point.x + normal.x * distance,
    y: projection.point.y + normal.y * distance,
  };

  return {
    mouth,
    tip: {
      x: projection.point.x + normal.x * reach,
      y: projection.point.y + normal.y * reach,
    },
    feet: [
      { x: mouth.x - half.x, y: mouth.y - half.y },
      { x: mouth.x + half.x, y: mouth.y + half.y },
    ],
  };
}

/** The segment a centre line draws, or `null` when either endpoint is missing. */
export function centreLineGeometry(
  document: PatternDocument,
  mark: CentreLineMark,
): CentreLineGeometry | null {
  const start = pointAt(document, mark.start);
  const end = pointAt(document, mark.end);
  return start === null || end === null ? null : { start, end };
}

/** Whether a mark has geometry to draw right now. */
export function markIsBroken(document: PatternDocument, piece: Piece, mark: MarkEntity): boolean {
  return mark.type === 'notch'
    ? notchGeometry(document, piece, mark) === null
    : centreLineGeometry(document, mark) === null;
}
