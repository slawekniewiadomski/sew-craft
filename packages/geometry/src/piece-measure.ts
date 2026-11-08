import type { Bounds } from './document.js';
import type { PatternDocument, Piece, PointEntity } from './types.js';
import type { Vec2 } from './vector.js';
import { pieceCutLoop, pieceLoop, signedArea } from './piece-loop.js';

/** Per-piece measurements shown in the inspector and exported as metadata. */
export interface PieceMetrics {
  finished: { width: number; height: number };
  cut: { width: number; height: number };
  cutArea: number;
  allowanceArea: number;
  quantity: number;
}

/** Axis-aligned bounds of a closed loop, or `null` for an empty loop. */ export function loopBounds(
  points: readonly Vec2[],
): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** The cut loop's bounding box, or `null` when the piece cannot resolve. */
export function pieceCutBounds(document: PatternDocument, piece: Piece): Bounds | null {
  const cut = pieceCutLoop(document, piece);
  return cut === null ? null : loopBounds(cut.points);
}

/**
 * A piece's own bounds: the stitch loop when it resolves, otherwise the bounds
 * of the points it owns. Shared by the piece-tab fit and the assembly anchor, so
 * an allowance edit never moves a placed instance.
 */
export function pieceBounds(document: PatternDocument, piece: Piece): Bounds | null {
  const loop = pieceLoop(document, piece);
  if (loop !== null) return loopBounds(loop.points);

  const owned = document.entities.filter(
    (entity): entity is PointEntity => entity.kind === 'point' && entity.piece === piece.id,
  );
  if (owned.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of owned) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function areaOf(points: readonly Vec2[]): number {
  return Math.abs(signedArea(points));
}

/** Finished and cut sizes, cut area, allowance area and quantity for a piece. */
export function pieceMetrics(document: PatternDocument, piece: Piece): PieceMetrics | null {
  const loop = pieceLoop(document, piece);
  const cut = pieceCutLoop(document, piece);
  if (loop === null || cut === null) return null;

  // A resolved loop always has at least three points.
  const finished = loopBounds(loop.points)!;
  const cutBounds = loopBounds(cut.points)!;

  const finishedArea = areaOf(loop.points);
  const cutArea = areaOf(cut.points);
  return {
    finished: {
      width: finished.max.x - finished.min.x,
      height: finished.max.y - finished.min.y,
    },
    cut: {
      width: cutBounds.max.x - cutBounds.min.x,
      height: cutBounds.max.y - cutBounds.min.y,
    },
    cutArea,
    allowanceArea: cutArea - finishedArea,
    quantity: piece.quantity ?? 1,
  };
}
