import {
  allPoints,
  type Command,
  type EntityId,
  type PatternDocument,
  type Vec2,
} from '@sewcraft/geometry';

import { endpointPosition, sameDraftingEndpoint, type DraftingEndpoint } from './drafting';

/**
 * How a rectangle gesture derives its four corners: two opposite corners, a
 * centre plus one corner, or a corner, the end of the first side and a point
 * that gives the width.
 */
export type RectangleMode = 'diagonal' | 'center' | 'three_point';

/** Millimetres below which a side is treated as degenerate. */
export const MIN_RECTANGLE_SIZE = 0.001;

/** Clicks a mode needs before it can commit; the canvas also previews the last one. */
export const RECTANGLE_CLICKS: Record<RectangleMode, number> = {
  diagonal: 2,
  center: 2,
  three_point: 3,
};

/** Same point id, or coordinates within the endpoint tolerance. */
function repeatedClick(clicks: DraftingEndpoint[]): boolean {
  return clicks.some((click, index) =>
    clicks.slice(0, index).some((earlier) => sameDraftingEndpoint(earlier, click)),
  );
}

/** The clicked endpoints as world positions, or `null` when one no longer resolves. */
function clickPositions(document: PatternDocument, clicks: DraftingEndpoint[]): Vec2[] | null {
  const positions: Vec2[] = [];
  for (const click of clicks) {
    const position = endpointPosition(document, click);
    if (position === null) return null;
    positions.push(position);
  }
  return positions;
}

/** Two opposite corners: the rectangle's sides follow the axes. */
function diagonalCorners(first: Vec2, second: Vec2): Vec2[] | null {
  const width = second.x - first.x;
  const height = second.y - first.y;
  if (Math.abs(width) < MIN_RECTANGLE_SIZE || Math.abs(height) < MIN_RECTANGLE_SIZE) {
    return null;
  }

  return [
    { x: first.x, y: first.y },
    { x: second.x, y: first.y },
    { x: second.x, y: second.y },
    { x: first.x, y: second.y },
  ];
}

/** A centre and one corner: the rectangle mirrors that corner around the centre. */
function centerCorners(center: Vec2, corner: Vec2): Vec2[] | null {
  const dx = corner.x - center.x;
  const dy = corner.y - center.y;
  if (Math.abs(dx) * 2 < MIN_RECTANGLE_SIZE || Math.abs(dy) * 2 < MIN_RECTANGLE_SIZE) {
    return null;
  }

  return [
    { x: center.x - dx, y: center.y - dy },
    { x: center.x + dx, y: center.y - dy },
    { x: center.x + dx, y: center.y + dy },
    { x: center.x - dx, y: center.y + dy },
  ];
}

/**
 * A corner, the end of the first side and a third point: the first two fix the
 * rotation and the length, the third gives the perpendicular width and, by the
 * side of the line it falls on, the direction the rectangle grows in.
 */
function threePointCorners(start: Vec2, end: Vec2, through: Vec2): Vec2[] | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < MIN_RECTANGLE_SIZE) return null;

  // Unit normal to the first side; the third click's projection onto it is the depth.
  const nx = -dy / length;
  const ny = dx / length;
  const depth = (through.x - start.x) * nx + (through.y - start.y) * ny;
  if (Math.abs(depth) < MIN_RECTANGLE_SIZE) return null;

  return [
    { x: start.x, y: start.y },
    { x: end.x, y: end.y },
    { x: end.x + nx * depth, y: end.y + ny * depth },
    { x: start.x + nx * depth, y: start.y + ny * depth },
  ];
}

/**
 * The four corners in traversal order (A, B, C, D), or `null` when the clicks
 * cannot form a rectangle: a repeated click, a side shorter than
 * {@link MIN_RECTANGLE_SIZE}, or a third point on the first side's line. The
 * canvas uses this for both the live preview and the commit, so a drawn rectangle
 * is always committable and a committed rectangle is always what was drawn.
 */
export function rectangleCorners(
  document: PatternDocument,
  mode: RectangleMode,
  clicks: DraftingEndpoint[],
): Vec2[] | null {
  if (clicks.length !== RECTANGLE_CLICKS[mode]) return null;
  if (repeatedClick(clicks)) return null;

  const positions = clickPositions(document, clicks);
  if (positions === null) return null;

  switch (mode) {
    case 'diagonal':
      return diagonalCorners(positions[0]!, positions[1]!);
    case 'center':
      return centerCorners(positions[0]!, positions[1]!);
    case 'three_point':
      return threePointCorners(positions[0]!, positions[1]!, positions[2]!);
  }
}

/** A document point already at these coordinates, so a corner can be reused. */
function pointAt(document: PatternDocument, corner: Vec2): EntityId | null {
  const existing = allPoints(document).find(
    (point) => point.x === corner.x && point.y === corner.y,
  );
  return existing === undefined ? null : existing.id;
}

/**
 * The corners that would become new points, in the order they were derived. A
 * corner an existing point already occupies is reused instead, which is why it
 * gets no provisional marker in the preview.
 */
export function newRectangleCorners(document: PatternDocument, corners: Vec2[]): Vec2[] {
  return corners.filter((corner) => pointAt(document, corner) === null);
}

/**
 * The command batch for one gesture: `add_point` for each corner no existing
 * point covers, then the four lines in traversal order (A→B, B→C, C→D, D→A).
 * A degenerate gesture yields an empty batch, so nothing is written.
 */
export function buildRectangleCommands(
  document: PatternDocument,
  mode: RectangleMode,
  clicks: DraftingEndpoint[],
  nextId: (prefix: string) => EntityId,
): Command[] {
  const corners = rectangleCorners(document, mode, clicks);
  if (corners === null) return [];

  const commands: Command[] = [];
  const ids = corners.map((corner): EntityId => {
    const existing = pointAt(document, corner);
    if (existing !== null) return existing;

    const id = nextId('point');
    commands.push({ id, type: 'add_point', params: { x: corner.x, y: corner.y } });
    return id;
  });

  ids.forEach((start, index) => {
    commands.push({
      id: nextId('line'),
      type: 'add_line',
      params: { start, end: ids[(index + 1) % ids.length]! },
    });
  });

  return commands;
}
