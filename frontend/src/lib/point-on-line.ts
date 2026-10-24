import {
  getEntity,
  lineEndpoints,
  projectPointOnLine,
  type Command,
  type EntityId,
  type PatternDocument,
  type Vec2,
} from '@sewcraft/geometry';

/**
 * The command batch for one Point-tool click on a straight line: create the
 * projected point, then constrain it to that line's supporting line, as one
 * undoable gesture. `null` when the id is not a resolvable, non-degenerate
 * straight line, so the caller falls back to today's free-point click.
 */
export function buildPointOnLineCommands(
  document: PatternDocument,
  lineId: EntityId,
  pointer: Vec2,
  nextId: (prefix: string) => EntityId,
): Command[] | null {
  const line = getEntity(document, lineId);
  if (line === undefined || line.kind !== 'line') return null;

  const segment = lineEndpoints(document, lineId);
  if (segment === null) return null;

  const projected = projectPointOnLine(pointer, segment);
  if (projected === null) return null;

  const pointId = nextId('point');
  return [
    { id: pointId, type: 'add_point', params: { x: projected.x, y: projected.y } },
    {
      id: nextId('constraint'),
      type: 'add_constraint',
      params: { type: 'point_on_line', entities: [pointId, line.start, line.end] },
    },
  ];
}
