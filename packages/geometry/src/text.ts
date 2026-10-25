import type { TextEntity, TextAlignment } from './types.js';
import type { Vec2 } from './vector.js';

/** Monospace advance as a fraction of the cap height. */
export const MONO_ADVANCE_RATIO = 0.6;

/** Default cap height in millimetres. */
export const DEFAULT_TEXT_SIZE = 10;

export const MIN_TEXT_SIZE = 1;
export const MAX_TEXT_SIZE = 100;
export const MAX_TEXT_LENGTH = 120;

/** The leader's rule sits this fraction of a cap height below the baseline. */
export const LEADER_RULE_GAP_RATIO = 0.12;
/** Arrow head length as a fraction of the cap height. */
export const LEADER_HEAD_LENGTH_RATIO = 0.3;
/** Arrow head width as a fraction of the cap height. */
export const LEADER_HEAD_WIDTH_RATIO = 0.15;

/** The rotated bounds of a label, used for drawing and hit-testing. */
export interface TextLayout {
  /** Rotated box corners, in drawing order: bottom-left, bottom-right, top-right, top-left. */
  corners: Vec2[];
  width: number;
  height: number;
  rotation: number;
}

/** A straight line between two points. */
export interface Segment {
  start: Vec2;
  end: Vec2;
}

/** The derived parts of a leader: the rule, its shaft and the filled arrow head. */
export interface LeaderGeometry {
  /** The rule under the label, spanning its width. */
  underline: Segment;
  /** The shaft from the nearer rule end to the head base; `null` when the head fills it. */
  shaft: Segment | null;
  /** The filled triangle's corners: the tip first, then the two base corners. */
  head: Vec2[];
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

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Two distances this close to each other count as a tie. */
const TIE_EPSILON = 1e-6;

/**
 * The leader's derived geometry, or `null` when there is no leader or either
 * endpoint is missing. The rule spans the label width just below its baseline;
 * the shaft leaves from whichever rule end is nearer the target and stops at
 * the base of a filled head whose tip is the target. A leader shorter than the
 * head shrinks the head proportionally, so the head never inverts.
 */
export function textLeaderGeometry(
  entity: TextEntity,
  anchor: Vec2 | null,
  leader: Vec2 | null,
): LeaderGeometry | null {
  if (entity.leader === undefined || anchor === null || leader === null) return null;
  // `anchor` is present, so the layout always resolves.
  const layout = textLayout(entity, anchor)!;

  const size = entity.fontSize ?? DEFAULT_TEXT_SIZE;
  const gap = size * LEADER_RULE_GAP_RATIO;
  const down = rotate({ x: 0, y: 1 }, layout.rotation);
  const underline: Segment = {
    start: { x: layout.corners[0]!.x + down.x * gap, y: layout.corners[0]!.y + down.y * gap },
    end: { x: layout.corners[1]!.x + down.x * gap, y: layout.corners[1]!.y + down.y * gap },
  };

  const fromStart = Math.hypot(leader.x - underline.start.x, leader.y - underline.start.y);
  const fromEnd = Math.hypot(leader.x - underline.end.x, leader.y - underline.end.y);
  let start = underline.start;
  if (Math.abs(fromStart - fromEnd) > TIE_EPSILON) {
    start = fromStart < fromEnd ? underline.start : underline.end;
  } else {
    // A tie follows the target's side of the label centre along the rule, and
    // falls back to the right end when the target sits on the centre line.
    const centre = midpoint(underline.start, underline.end);
    const along =
      (leader.x - centre.x) * (underline.end.x - underline.start.x) +
      (leader.y - centre.y) * (underline.end.y - underline.start.y);
    start = along < 0 ? underline.start : underline.end;
  }

  const dx = leader.x - start.x;
  const dy = leader.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return { underline, shaft: null, head: [leader, leader, leader] };
  }

  const ux = dx / length;
  const uy = dy / length;
  const headLength = size * LEADER_HEAD_LENGTH_RATIO;
  const halfWidth = (size * LEADER_HEAD_WIDTH_RATIO) / 2;
  const scale = Math.min(1, length / headLength);
  const base = {
    x: leader.x - ux * headLength * scale,
    y: leader.y - uy * headLength * scale,
  };
  const offsetX = -uy * halfWidth * scale;
  const offsetY = ux * halfWidth * scale;

  return {
    underline,
    shaft: length > headLength ? { start, end: base } : null,
    head: [
      leader,
      { x: base.x + offsetX, y: base.y + offsetY },
      { x: base.x - offsetX, y: base.y - offsetY },
    ],
  };
}
