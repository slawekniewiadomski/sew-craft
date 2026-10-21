import {
  allPoints,
  type Command,
  type EntityId,
  type PatternDocument,
  type Vec2,
} from '@sewcraft/geometry';

import { snapPoint } from './snap';

/** Millimetre tolerance for treating two new coordinates as the same endpoint. */
export const ENDPOINT_TOLERANCE = 0.001;

/**
 * One end of a line being drawn: a document point reused by id, or a snapped
 * coordinate that only becomes a point when the line commits.
 */
export type LineEndpoint = { kind: 'point'; id: EntityId } | { kind: 'new'; x: number; y: number };

/**
 * Resolve a bare-canvas click: the snapped position is reused when it coincides
 * with an existing point, otherwise it stays provisional until completion.
 */
export function resolveLineEndpoint(document: PatternDocument, world: Vec2): LineEndpoint {
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
export function sameEndpoint(a: LineEndpoint, b: LineEndpoint): boolean {
  if (a.kind === 'point' && b.kind === 'point') return a.id === b.id;
  if (a.kind === 'new' && b.kind === 'new') {
    return Math.abs(a.x - b.x) <= ENDPOINT_TOLERANCE && Math.abs(a.y - b.y) <= ENDPOINT_TOLERANCE;
  }
  return false;
}

/**
 * The command batch for one gesture: `add_point` for each new endpoint in click
 * order, then one `add_line` between the resolved ids. `add_line` itself keeps
 * requiring existing points, so the batch is the only thing that changes.
 */
export function buildLineCommands(
  start: LineEndpoint,
  end: LineEndpoint,
  nextId: (prefix: string) => EntityId,
): Command[] {
  const commands: Command[] = [];

  const resolve = (endpoint: LineEndpoint): EntityId => {
    if (endpoint.kind === 'point') return endpoint.id;

    const id = nextId('point');
    commands.push({ id, type: 'add_point', params: { x: endpoint.x, y: endpoint.y } });
    return id;
  };

  const startId = resolve(start);
  const endId = resolve(end);
  commands.push({ id: nextId('line'), type: 'add_line', params: { start: startId, end: endId } });

  return commands;
}
