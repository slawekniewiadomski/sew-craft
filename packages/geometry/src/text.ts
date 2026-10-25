import type { TextEntity, TextAlignment } from './types.js';
import type { Vec2 } from './vector.js';

/** Monospace advance as a fraction of the cap height. */
export const MONO_ADVANCE_RATIO = 0.6;

/** Default cap height in millimetres. */
export const DEFAULT_TEXT_SIZE = 6;

export const MIN_TEXT_SIZE = 1;
export const MAX_TEXT_SIZE = 100;
export const MAX_TEXT_LENGTH = 120;

/** The rotated bounds of a label, used for drawing and hit-testing. */
export interface TextLayout {
  /** Rotated box corners, in drawing order: bottom-left, bottom-right, top-right, top-left. */
  corners: Vec2[];
  width: number;
  height: number;
  rotation: number;
}

function rotate(point: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function alignmentOffset(alignment: TextAlignment, width: number): number {
  switch (alignment) {
    case 'left':
      return 0;
    case 'center':
      return -width / 2;
    case 'right':
      return -width;
  }
}

/**
 * The label's box at its anchor, or `null` when the anchor is missing. The box
 * sits above the baseline; `alignment` moves it horizontally around the anchor
 * and `rotation` turns it counter-clockwise around the same point.
 */
export function textLayout(entity: TextEntity, anchor: Vec2 | null): TextLayout | null {
  if (anchor === null) return null;

  const size = entity.fontSize ?? DEFAULT_TEXT_SIZE;
  const width = entity.content.length * size * MONO_ADVANCE_RATIO;
  const height = size;
  const rotation = entity.rotation ?? 0;
  const left = alignmentOffset(entity.alignment ?? 'left', width);

  const local: Vec2[] = [
    { x: left, y: 0 },
    { x: left + width, y: 0 },
    { x: left + width, y: -height },
    { x: left, y: -height },
  ];

  return {
    corners: local.map((corner) => {
      const turned = rotate(corner, rotation);
      return { x: anchor.x + turned.x, y: anchor.y + turned.y };
    }),
    width,
    height,
    rotation,
  };
}

function nearestOnSegment(point: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Guard the division without a branch: a degenerate (zero-length) edge simply
  // resolves to its start point.
  const lengthSquared = Math.max(dx * dx + dy * dy, Number.EPSILON);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * The leader polyline from the label's nearest edge to the leader point, or
 * `null` when there is no leader or either endpoint is missing. The label edge
 * is picked from the laid-out box, so a rotated label leads from its turned edge.
 */
export function textLeader(
  entity: TextEntity,
  anchor: Vec2 | null,
  leader: Vec2 | null,
): Vec2[] | null {
  if (leader === null || entity.leader === undefined) return null;
  const layout = textLayout(entity, anchor);
  if (layout === null) return null;

  let best = layout.corners[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < layout.corners.length; index += 1) {
    const a = layout.corners[index]!;
    const b = layout.corners[(index + 1) % layout.corners.length]!;
    const candidate = nearestOnSegment(leader, a, b);
    const distance = Math.hypot(candidate.x - leader.x, candidate.y - leader.y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return [best, leader];
}
