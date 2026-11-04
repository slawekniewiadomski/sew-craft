import { edgePolyline, getEntity, NOTCH_SNAP_TOLERANCE, pieceById } from '@sewcraft/geometry';
import type { EntityId, PatternDocument, Vec2 } from '@sewcraft/geometry';

/** The mark a click would create: the snapped point and the edge it notches. */
export interface NotchTarget {
  point: EntityId;
  edge: EntityId;
}

/** Shortest distance from a point to a polyline, in millimetres. */
export function distanceToPolyline(polyline: readonly Vec2[], point: Vec2): number {
  let best = Number.POSITIVE_INFINITY;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]!;
    const end = polyline[index + 1]!;
    const spanX = end.x - start.x;
    const spanY = end.y - start.y;
    const length = Math.hypot(spanX, spanY);
    const along =
      length === 0
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              ((point.x - start.x) * spanX + (point.y - start.y) * spanY) / (length * length),
            ),
          );
    best = Math.min(
      best,
      Math.hypot(point.x - (start.x + spanX * along), point.y - (start.y + spanY * along)),
    );
  }

  return best;
}

/**
 * The notch a click on `pointId` would create. A point shared by two loop edges
 * belongs to both, so the pointer decides: the edge it is nearest wins, which is
 * the allowance the maker was pointing at. `null` when the point lies on no edge
 * of the piece.
 */
export function notchTargetAt(
  document: PatternDocument,
  pieceId: EntityId,
  pointId: EntityId,
  pointer: Vec2,
): NotchTarget | null {
  const piece = pieceById(document, pieceId);
  const entity = getEntity(document, pointId);
  if (piece === undefined || entity === undefined || entity.kind !== 'point') return null;

  const position = { x: entity.x, y: entity.y };
  let best: { edge: EntityId; distance: number } | null = null;

  for (const edge of piece.edges) {
    const polyline = edgePolyline(document, edge);
    if (polyline === null) continue;
    if (distanceToPolyline(polyline, position) > NOTCH_SNAP_TOLERANCE) continue;

    const distance = distanceToPolyline(polyline, pointer);
    if (best === null || distance < best.distance) best = { edge, distance };
  }

  return best === null ? null : { point: pointId, edge: best.edge };
}
