import {
  getEntity,
  isCornerRoundDerived,
  lineEndpoints,
  MIN_SPLIT_LENGTH,
  midpointTargetFor,
  type Command,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
  type Vec2,
} from '@sewcraft/geometry';

import { POINT_SNAP_TOLERANCE } from './snap';

/** A reused authored point must sit this close to the line, in millimetres. */
export const SPLIT_ON_LINE_TOLERANCE = MIN_SPLIT_LENGTH;
/** An authored point within this distance of the projection is reused. */
export const SPLIT_POINT_TOLERANCE = POINT_SNAP_TOLERANCE;

/** Where a Split-tool click on a line would land, and whether it reuses a point. */
export interface SplitCandidate {
  lineId: EntityId;
  /** The authored point the split reuses, or `null` when the click creates one. */
  pointId: EntityId | null;
  /** Where the ghost is drawn: the reused point or the projected click. */
  position: Vec2;
}

interface LineProjection {
  length: number;
  along: number;
  off: number;
}

function projectLine(start: Vec2, end: Vec2, point: Vec2): LineProjection {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const rx = point.x - start.x;
  const ry = point.y - start.y;
  return { length, along: rx * ux + ry * uy, off: Math.abs(-rx * uy + ry * ux) };
}

/** Whether the projection is at least one accepted half away from both ends. */
function insideLine(projection: LineProjection): boolean {
  return (
    projection.along > MIN_SPLIT_LENGTH && projection.length - projection.along > MIN_SPLIT_LENGTH
  );
}

function lineEntity(document: PatternDocument, lineId: EntityId): LineEntity | null {
  const entity = getEntity(document, lineId);
  return entity === undefined || entity.kind !== 'line' ? null : entity;
}

/**
 * The nearest authored point that the command would accept as a split target:
 * not an endpoint, not derived, in the same piece, within `tolerance` of the
 * projection, and within 0.001 mm of the line itself.
 */
function nearestSplitPoint(
  document: PatternDocument,
  line: LineEntity,
  ends: { start: Vec2; end: Vec2 },
  projected: Vec2,
  tolerance: number,
): PointEntity | null {
  let nearest: PointEntity | null = null;
  let nearestDistance = tolerance;

  for (const entity of document.entities) {
    if (entity.kind !== 'point') continue;
    if (entity.id === line.start || entity.id === line.end) continue;
    if (line.piece !== undefined && entity.piece !== undefined && entity.piece !== line.piece) {
      continue;
    }
    if (isCornerRoundDerived(document, entity.id)) continue;
    if (midpointTargetFor(document, entity.id) !== undefined) continue;

    const distance = Math.hypot(entity.x - projected.x, entity.y - projected.y);
    if (distance > nearestDistance) continue;

    const own = projectLine(ends.start, ends.end, entity);
    if (own.off > SPLIT_ON_LINE_TOLERANCE || !insideLine(own)) continue;

    nearest = entity;
    nearestDistance = distance;
  }

  return nearest;
}

/**
 * Resolve a Split-tool pointer position against a straight line. The click is
 * projected onto the line; an authored point within the snap tolerance of that
 * projection wins and is reused, so the shared vertex is an exact existing
 * point. `null` when the line does not resolve or the projection is an endpoint
 * or a sliver.
 */
export function splitCandidate(
  document: PatternDocument,
  lineId: EntityId,
  pointer: Vec2,
  pointTolerance: number = SPLIT_POINT_TOLERANCE,
): SplitCandidate | null {
  const line = lineEntity(document, lineId);
  if (line === null) return null;

  const ends = lineEndpoints(document, lineId);
  if (ends === null) return null;

  const projection = projectLine(ends.start, ends.end, pointer);
  if (!insideLine(projection)) return null;

  const unitX = (ends.end.x - ends.start.x) / projection.length;
  const unitY = (ends.end.y - ends.start.y) / projection.length;
  const projected = {
    x: ends.start.x + unitX * projection.along,
    y: ends.start.y + unitY * projection.along,
  };

  const point = nearestSplitPoint(document, line, ends, projected, pointTolerance);
  return point === null
    ? { lineId, pointId: null, position: projected }
    : { lineId, pointId: point.id, position: { x: point.x, y: point.y } };
}

/** The role the new split point mirrors from the line it splits. */
function roleParams(line: LineEntity): {
  role?: 'construction' | 'annotation';
  construction?: boolean;
} {
  if (line.role !== undefined) return { role: line.role };
  return line.construction ? { construction: true } : {};
}

/**
 * The command batch for one Split-tool click: a `split_line` command when the
 * pointer reuses an authored point, or `add_point` followed by `split_line` when
 * it creates the shared vertex. The point mirrors the line's role and piece.
 */
export function buildSplitLineCommands(
  document: PatternDocument,
  lineId: EntityId,
  pointer: Vec2,
  nextId: (prefix: string) => EntityId,
): Command[] | null {
  const candidate = splitCandidate(document, lineId, pointer);
  if (candidate === null) return null;

  // `splitCandidate` already resolved this id as a straight line.
  const line = getEntity(document, lineId) as LineEntity;

  if (candidate.pointId !== null) {
    return [
      {
        id: nextId('split'),
        type: 'split_line',
        params: { line: lineId, point: candidate.pointId },
      },
    ];
  }

  const pointId = nextId('point');
  return [
    {
      id: pointId,
      type: 'add_point',
      params: {
        x: candidate.position.x,
        y: candidate.position.y,
        ...(line.piece === undefined ? {} : { piece: line.piece }),
        ...roleParams(line),
      },
    },
    {
      id: nextId('split'),
      type: 'split_line',
      params: { line: lineId, point: pointId },
    },
  ];
}
