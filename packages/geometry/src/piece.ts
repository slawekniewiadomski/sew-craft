import { getEntity } from './document.js';
import { isCut } from './roles.js';
import type { AllowanceKind, EntityId, PatternDocument, Piece } from './types.js';
import { edgeEndpointIds, type PieceEdgeEntity } from './piece-loop.js';

export {
  allowanceDistance,
  allowanceForEdge,
  pieceForEdge,
  cornerAllowanceForRound,
  cornerAllowanceState,
  type CornerAllowanceState,
} from './piece-allowance.js';
export type {
  BandRegion,
  BandTarget,
  CutAnchorResolution,
  PieceCutLoop,
  PieceLoop,
  PieceValidation,
} from './piece-loop.js';
export {
  bandTargetKey,
  edgeEndpointIds,
  pieceBandRegions,
  pieceCutEdge,
  pieceCutLoop,
  pieceCutVertex,
  pieceEdges,
  pieceFoldLines,
  pieceLoop,
  pieceLoopVertex,
  resolveCutAnchor,
  resolvePieceAnchor,
  signedArea,
  validatePiece,
} from './piece-loop.js';
export type { PieceMetrics } from './piece-measure.js';
export { loopBounds, pieceBounds, pieceCutBounds, pieceMetrics } from './piece-measure.js';

/** A piece by id. */
export function pieceById(document: PatternDocument, id: EntityId): Piece | undefined {
  return document.pieces.find((piece) => piece.id === id);
}

/**
 * Every simple closed chain among `edgeIds` (default: every cut line, curve and
 * arc). A component qualifies only when every vertex joins exactly two of its
 * edges, so a branch or an open chain is never mistaken for a loop. Used by the
 * 0.1 migration to adopt closed seam chains.
 */
export function basicPieceForLoops(
  document: PatternDocument,
  edgeIds?: readonly EntityId[],
): EntityId[][] {
  const candidates = new Set(
    edgeIds ??
      document.entities
        .filter(
          (entity): entity is PieceEdgeEntity =>
            entity.kind === 'line' || entity.kind === 'curve' || entity.kind === 'arc',
        )
        .filter((entity) => isCut(entity))
        .map((entity) => entity.id),
  );

  const endpoints = new Map<EntityId, [EntityId, EntityId]>();
  const incident = new Map<EntityId, EntityId[]>();

  for (const id of candidates) {
    const entity = getEntity(document, id);
    if (
      entity === undefined ||
      entity.kind === 'point' ||
      entity.kind === 'circle' ||
      entity.kind === 'text' ||
      entity.kind === 'mark' ||
      !isCut(entity)
    ) {
      continue;
    }
    const [start, end] = edgeEndpointIds(entity);
    if (
      getEntity(document, start)?.kind !== 'point' ||
      getEntity(document, end)?.kind !== 'point'
    ) {
      continue;
    }
    endpoints.set(id, [start, end]);
    incident.set(start, [...(incident.get(start) ?? []), id]);
    incident.set(end, [...(incident.get(end) ?? []), id]);
  }

  const remaining = new Set(endpoints.keys());
  const loops: EntityId[][] = [];

  while (remaining.size > 0) {
    const seed = remaining.values().next().value as EntityId;
    const component = new Set<EntityId>();
    const vertices = new Set<EntityId>();
    const stack = [seed];

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (component.has(id)) continue;
      component.add(id);
      remaining.delete(id);
      for (const vertex of endpoints.get(id)!) {
        vertices.add(vertex);
        for (const neighbour of incident.get(vertex)!) {
          if (!component.has(neighbour) && remaining.has(neighbour)) stack.push(neighbour);
        }
      }
    }

    const simple = [...vertices].every((vertex) => incident.get(vertex)!.length === 2);
    if (!simple || component.size < 3) continue;

    const walk: EntityId[] = [];
    const start = component.values().next().value as EntityId;
    let current = start;
    let vertex = endpoints.get(start)![0];

    while (walk.length < component.size) {
      walk.push(current);
      const [a, b] = endpoints.get(current)!;
      const nextVertex = a === vertex ? b : a;
      const next = incident.get(nextVertex)!.find((id) => id !== current)!;
      if (next === start) break;
      current = next;
      vertex = nextVertex;
    }

    // Every vertex has degree two, so this walk is the component's single cycle.
    loops.push(walk);
  }

  return loops;
}

export const ALLOWANCE_KIND_LABELS: Record<AllowanceKind, string> = {
  seam: 'Seam',
  single: 'Single fold',
  double: 'Double fold',
};
