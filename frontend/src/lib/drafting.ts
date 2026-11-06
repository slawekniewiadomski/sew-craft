import {
  allPoints,
  isAnnotation,
  isCornerRoundDerived,
  lineMidpoint,
  type Command,
  type EntityId,
  getEntity,
  type PatternDocument,
  type Vec2,
} from '@sewcraft/geometry';

import { nearestLineMidpoint } from './midpoint';
import { nearestPoint, snapPoint, snapToGrid } from './snap';

/** Millimetre tolerance for treating two new coordinates as the same endpoint. */
export const ENDPOINT_TOLERANCE = 0.001;

/**
 * One end of a drafting gesture: a document point reused by id, or a snapped
 * coordinate that only becomes a point when the gesture commits.
 */
export type DraftingEndpoint =
  | { kind: 'point'; id: EntityId }
  | { kind: 'midpoint'; lineId: EntityId; x: number; y: number }
  | { kind: 'new'; x: number; y: number };

/**
 * Resolve a bare-canvas click for a drafting tool: the snapped position is reused
 * when it coincides with an existing point, otherwise it stays provisional until
 * the gesture completes. Shared by the Line, Curve, Circle and Arc tools so they
 * all snap and reuse points the same way.
 */
export function resolveDraftingEndpoint(
  document: PatternDocument,
  world: Vec2,
  activePieceId?: EntityId | null,
  midpointTolerance?: number,
): DraftingEndpoint {
  // Annotation points are sewing marks, never drafting anchors; an active piece
  // also keeps a gesture inside its own container.
  const points = allPoints(document).filter(
    (point) =>
      !isAnnotation(point) &&
      (activePieceId === undefined ||
        activePieceId === null ||
        point.piece === undefined ||
        point.piece === activePieceId),
  );
  const coordinates = points.map((point) => ({ x: point.x, y: point.y }));

  // Precedence: an existing point snap wins, then the line midpoint magnet, then
  // the grid. Without a tolerance the resolution is exactly the old point/grid
  // snap, so tools that do not opt in keep their behaviour.
  const nearest = nearestPoint(world, coordinates);
  if (nearest !== null) {
    const existing = points.find((point) => point.x === nearest.x && point.y === nearest.y)!;
    return { kind: 'point', id: existing.id };
  }

  if (midpointTolerance !== undefined) {
    const midpoint = nearestLineMidpoint(document, world, midpointTolerance, activePieceId);
    if (midpoint !== null) {
      return { kind: 'midpoint', lineId: midpoint.lineId, x: midpoint.x, y: midpoint.y };
    }
  }

  const snapped = snapToGrid(world);
  const existing = points.find((point) => point.x === snapped.x && point.y === snapped.y);

  return existing === undefined
    ? { kind: 'new', x: snapped.x, y: snapped.y }
    : { kind: 'point', id: existing.id };
}

/** The points a text gesture can snap to, never a derived corner-round point. */
function textSnapPoints(
  document: PatternDocument,
  activePieceId?: EntityId | null,
): { id: EntityId; x: number; y: number }[] {
  return allPoints(document).filter(
    (point) =>
      !isCornerRoundDerived(document, point.id) &&
      (activePieceId === undefined ||
        activePieceId === null ||
        point.piece === undefined ||
        point.piece === activePieceId),
  );
}

/**
 * The first click of a label gesture: snap to a nearby point or the grid, but
 * always resolve to a fresh coordinate. A label's anchor is private to it, so
 * dragging the label can never move pattern geometry.
 */
export function resolveTextAnchorEndpoint(
  document: PatternDocument,
  world: Vec2,
  activePieceId?: EntityId | null,
): DraftingEndpoint {
  const snapped = snapPoint(
    world,
    textSnapPoints(document, activePieceId).map((point) => ({ x: point.x, y: point.y })),
  );
  return { kind: 'new', x: snapped.x, y: snapped.y };
}

/**
 * The second click of a label gesture: reuse a point of the active piece —
 * annotation marks included — when one snaps, otherwise create a new one at the
 * grid-snapped position. Corner-round-derived points are not candidates.
 */
export function resolveLeaderEndpoint(
  document: PatternDocument,
  world: Vec2,
  activePieceId?: EntityId | null,
): DraftingEndpoint {
  const points = textSnapPoints(document, activePieceId);
  const snapped = snapPoint(
    world,
    points.map((point) => ({ x: point.x, y: point.y })),
  );
  const existing = points.find((point) => point.x === snapped.x && point.y === snapped.y);
  return existing === undefined
    ? { kind: 'new', x: snapped.x, y: snapped.y }
    : { kind: 'point', id: existing.id };
}

/** Same point id, midpoint line, or coordinates within {@link ENDPOINT_TOLERANCE}. */
export function sameDraftingEndpoint(a: DraftingEndpoint, b: DraftingEndpoint): boolean {
  if (a.kind === 'point' && b.kind === 'point') return a.id === b.id;
  if (a.kind === 'midpoint' && b.kind === 'midpoint') return a.lineId === b.lineId;
  if (a.kind === 'new' && b.kind === 'new') {
    return Math.abs(a.x - b.x) <= ENDPOINT_TOLERANCE && Math.abs(a.y - b.y) <= ENDPOINT_TOLERANCE;
  }
  return false;
}

/**
 * Whether an endpoint references a document point that no longer exists, so a
 * pending gesture can be dropped when that point is deleted or undone away.
 */
export function endpointMissing(
  document: PatternDocument,
  endpoint: DraftingEndpoint | null,
): boolean {
  if (endpoint === null) return false;
  if (endpoint.kind === 'midpoint') return lineMidpoint(document, endpoint.lineId) === null;
  return endpoint.kind === 'point' && getEntity(document, endpoint.id) === undefined;
}

/**
 * World position of an endpoint: a provisional coordinate as-is, or the
 * referenced point's current position. Returns `null` when the referenced entity
 * is missing or is not a point, so a gesture holding a stale id degrades instead
 * of throwing.
 */
export function endpointPosition(
  document: PatternDocument,
  endpoint: DraftingEndpoint,
): Vec2 | null {
  if (endpoint.kind === 'new') return { x: endpoint.x, y: endpoint.y };
  if (endpoint.kind === 'midpoint') {
    // Follow a trim or a moved source line live; the stored coordinate is the
    // fallback for a line that still exists but cannot resolve.
    return lineMidpoint(document, endpoint.lineId) ?? { x: endpoint.x, y: endpoint.y };
  }

  const entity = getEntity(document, endpoint.id);
  if (entity === undefined || entity.kind !== 'point') return null;
  return { x: entity.x, y: entity.y };
}

/** Append the `add_point` commands an endpoint needs and return its resolved id. */
export function resolveEndpointCommands(
  endpoint: DraftingEndpoint,
  commands: Command[],
  nextId: (prefix: string) => EntityId,
  piece?: EntityId,
  role?: 'construction' | 'annotation',
): EntityId {
  if (endpoint.kind === 'point') return endpoint.id;

  const id = nextId('point');
  commands.push({
    id,
    type: 'add_point',
    params: {
      x: endpoint.x,
      y: endpoint.y,
      piece,
      role,
    },
  });

  // A midpoint endpoint lands its relation immediately after its point, before
  // the geometry that uses it, so the whole gesture is one journal entry.
  if (endpoint.kind === 'midpoint') {
    commands.push({
      id: nextId('constraint'),
      type: 'add_constraint',
      params: {
        type: 'midpoint',
        entities: [id, endpoint.lineId],
        piece,
      },
    });
  }

  return id;
}
