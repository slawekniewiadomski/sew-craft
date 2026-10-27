import {
  lineMidpoint,
  type Command,
  type EntityId,
  type PatternDocument,
} from '@sewcraft/geometry';

/**
 * The command batch for one Point-tool click in a line's midpoint magnet: create
 * the point at the exact visible middle, then pin it with a line-form `midpoint`
 * relation, as one undoable gesture. `null` when the line cannot resolve, so the
 * caller falls back to its point, point-on-line or grid behaviour.
 */
export function buildPointMidpointCommands(
  document: PatternDocument,
  lineId: EntityId,
  nextId: (prefix: string) => EntityId,
  piece?: EntityId,
): Command[] | null {
  const midpoint = lineMidpoint(document, lineId);
  if (midpoint === null) return null;

  const pointId = nextId('point');
  return [
    {
      id: pointId,
      type: 'add_point',
      params: { x: midpoint.x, y: midpoint.y, ...(piece === undefined ? {} : { piece }) },
    },
    {
      id: nextId('constraint'),
      type: 'add_constraint',
      params: {
        type: 'midpoint',
        entities: [pointId, lineId],
        ...(piece === undefined ? {} : { piece }),
      },
    },
  ];
}
