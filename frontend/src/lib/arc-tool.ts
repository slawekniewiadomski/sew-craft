import {
  arcThroughPoints,
  type ArcGeometry,
  type Command,
  type EntityId,
  type PatternDocument,
} from '@sewcraft/geometry';

import { endpointPosition, resolveEndpointCommands, type DraftingEndpoint } from './drafting';

/**
 * One click of an arc gesture: a document point reused by id, or a snapped
 * coordinate that only becomes a point when the arc commits. Alias of the shared
 * {@link DraftingEndpoint}.
 */
export type ArcEndpoint = DraftingEndpoint;

/**
 * The circular arc through the three gesture endpoints, or `null` when they
 * cannot form one: a repeated point, coincident endpoints, or a third point
 * closer than `MIN_BULGE` to the start→end chord. The canvas uses this for both
 * the live preview and the commit guard, so a drawn arc is always committable
 * and a committed arc is always what was drawn.
 */
export function arcFromEndpoints(
  document: PatternDocument,
  start: ArcEndpoint,
  end: ArcEndpoint,
  through: ArcEndpoint,
): ArcGeometry | null {
  const startPosition = endpointPosition(document, start);
  const endPosition = endpointPosition(document, end);
  const throughPosition = endpointPosition(document, through);
  if (startPosition === null || endPosition === null || throughPosition === null) return null;

  return arcThroughPoints(startPosition, endPosition, throughPosition);
}

/**
 * The command batch for one gesture: `add_point` for each new endpoint in click
 * order, then one `add_arc`, applied as a single journal entry. Callers reject a
 * degenerate third click with {@link arcFromEndpoints} first; `add_arc` itself
 * keeps requiring existing, distinct, non-collinear points.
 */
export function buildArcCommands(
  start: ArcEndpoint,
  end: ArcEndpoint,
  through: ArcEndpoint,
  nextId: (prefix: string) => EntityId,
  piece?: EntityId,
): Command[] {
  const commands: Command[] = [];

  const startId = resolveEndpointCommands(start, commands, nextId, piece);
  const endId = resolveEndpointCommands(end, commands, nextId, piece);
  const throughId = resolveEndpointCommands(through, commands, nextId, piece);
  commands.push({
    id: nextId('arc'),
    type: 'add_arc',
    params: { start: startId, end: endId, through: throughId, ...(piece === undefined ? {} : { piece }) },
  });

  return commands;
}
