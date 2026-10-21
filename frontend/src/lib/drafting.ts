import {
  allPoints,
  type Command,
  type EntityId,
  getEntity,
  type PatternDocument,
  type Vec2,
} from '@sewcraft/geometry';

import { snapPoint } from './snap';

/** Millimetre tolerance for treating two new coordinates as the same endpoint. */
export const ENDPOINT_TOLERANCE = 0.001;

/**
 * One end of a drafting gesture: a document point reused by id, or a snapped
 * coordinate that only becomes a point when the gesture commits.
 */
export type DraftingEndpoint =
  { kind: 'point'; id: EntityId } | { kind: 'new'; x: number; y: number };

/**
 * Resolve a bare-canvas click for a drafting tool: the snapped position is reused
 * when it coincides with an existing point, otherwise it stays provisional until
 * the gesture completes. Shared by the Line, Curve, Circle and Arc tools so they
 * all snap and reuse points the same way.
 */
export function resolveDraftingEndpoint(document: PatternDocument, world: Vec2): DraftingEndpoint {
  const points = allPoints(document);
  const snapped = snapPoint(
    world,
    points.map((point) => ({ x: point.x, y: point.y })),
  );
  const existing = points.find((point) => point.x === snapped.x && point.y === snapped.y);

  return existing === undefined
    ? { kind: 'new', x: snapped.x, y: snapped.y }
    : { kind: 'point', id: existing.id };
}

/** Same point id, or coordinates within {@link ENDPOINT_TOLERANCE}. */
export function sameDraftingEndpoint(a: DraftingEndpoint, b: DraftingEndpoint): boolean {
  if (a.kind === 'point' && b.kind === 'point') return a.id === b.id;
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
  return (
    endpoint !== null && endpoint.kind === 'point' && getEntity(document, endpoint.id) === undefined
  );
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

  const entity = getEntity(document, endpoint.id);
  if (entity === undefined || entity.kind !== 'point') return null;
  return { x: entity.x, y: entity.y };
}

/** Append the `add_point` commands an endpoint needs and return its resolved id. */
export function resolveEndpointCommands(
  endpoint: DraftingEndpoint,
  commands: Command[],
  nextId: (prefix: string) => EntityId,
): EntityId {
  if (endpoint.kind === 'point') return endpoint.id;

  const id = nextId('point');
  commands.push({ id, type: 'add_point', params: { x: endpoint.x, y: endpoint.y } });
  return id;
}
