import {
  distance,
  isAnnotation,
  lineMidpoint,
  type EntityId,
  type PatternDocument,
  type Vec2,
} from '@sewcraft/geometry';

/** The visible line midpoint closest to the pointer, in world units. */
export interface MidpointCandidate {
  lineId: EntityId;
  x: number;
  y: number;
}

/**
 * The nearest visible, non-annotation straight line midpoint within `tolerance`
 * world units, limited to the active piece. Ties fall back to document order, so
 * the same click always picks the same line. `null` when nothing is close, which
 * lets the caller keep its point snap, point-on-line and grid behaviour.
 */
export function nearestLineMidpoint(
  document: PatternDocument,
  world: Vec2,
  tolerance: number,
  activePieceId?: EntityId | null,
): MidpointCandidate | null {
  let best: MidpointCandidate | null = null;
  let bestDistance = tolerance;

  for (const entity of document.entities) {
    if (entity.kind !== 'line' || isAnnotation(entity)) continue;
    if (
      activePieceId !== undefined &&
      activePieceId !== null &&
      entity.piece !== undefined &&
      entity.piece !== activePieceId
    ) {
      continue;
    }

    const midpoint = lineMidpoint(document, entity.id);
    if (midpoint === null) continue;

    const candidateDistance = distance(world, midpoint);
    if (candidateDistance > bestDistance) continue;
    if (best !== null && candidateDistance >= bestDistance) continue;

    best = { lineId: entity.id, x: midpoint.x, y: midpoint.y };
    bestDistance = candidateDistance;
  }

  return best;
}
