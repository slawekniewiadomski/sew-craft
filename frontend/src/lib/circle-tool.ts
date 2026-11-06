import type { Command, EntityId, PatternDocument, Vec2 } from '@sewcraft/geometry';

import { resolveLineEndpoint, sameEndpoint, type LineEndpoint } from './line-tool';

/** One endpoint of a circle gesture: a reused document point or a snapped coordinate. */
export type CircleEndpoint = LineEndpoint;

/**
 * Resolve a bare-canvas click for the Circle tool. Reuses the Line tool's
 * resolution, so an existing point under the pointer is reused by id and a bare
 * position is snapped (grid or nearby point) until the gesture commits.
 */
export function resolveCircleEndpoint(
  document: PatternDocument,
  world: Vec2,
  activePieceId?: EntityId | null,
  midpointTolerance?: number,
): CircleEndpoint {
  return resolveLineEndpoint(document, world, activePieceId, midpointTolerance);
}

/** Same point id, or coordinates within the endpoint tolerance. */
export function sameCircleEndpoint(a: CircleEndpoint, b: CircleEndpoint): boolean {
  return sameEndpoint(a, b);
}

/**
 * The command batch for one circle gesture: `add_point` for each new endpoint in
 * click order, then one `add_circle`. A degenerate radius (both endpoints the
 * same point or within tolerance) yields an empty batch, so no zero-radius
 * circle is ever built.
 */
export function buildCircleCommands(
  center: CircleEndpoint,
  rim: CircleEndpoint,
  nextId: (prefix: string) => EntityId,
  piece?: EntityId,
): Command[] {
  if (sameCircleEndpoint(center, rim)) return [];

  const commands: Command[] = [];

  const resolve = (endpoint: CircleEndpoint): EntityId => {
    if (endpoint.kind === 'point') return endpoint.id;

    const id = nextId('point');
    commands.push({
      id,
      type: 'add_point',
      params: { x: endpoint.x, y: endpoint.y, piece },
    });
    return id;
  };

  const centerId = resolve(center);
  const rimId = resolve(rim);
  commands.push({
    id: nextId('circle'),
    type: 'add_circle',
    params: { center: centerId, rim: rimId, piece },
  });

  return commands;
}
