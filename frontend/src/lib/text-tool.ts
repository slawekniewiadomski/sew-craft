import {
  DEFAULT_TEXT_SIZE,
  LEADER_RULE_GAP_RATIO,
  MAX_TEXT_LENGTH,
  textLayout,
  type Command,
  type EntityId,
  type TextEntity,
  type Vec2,
} from '@sewcraft/geometry';

import { ENDPOINT_TOLERANCE, resolveEndpointCommands, type DraftingEndpoint } from './drafting';

/** The word a freshly placed label starts with, selected for immediate editing. */
export const DEFAULT_TEXT_CONTENT = 'Text';

/**
 * The command batch for one label gesture: an `add_point` when the anchor lands
 * on bare canvas, an `add_point` for the arrow target when it is new, then one
 * `add_text`. Both new points are annotation geometry. A second click reuses an
 * existing target point by id through {@link resolveEndpointCommands}.
 */
export function buildTextCommands(
  anchor: DraftingEndpoint,
  piece: EntityId,
  nextId: (prefix: string) => EntityId,
  leader?: DraftingEndpoint,
): Command[] {
  const commands: Command[] = [];
  const anchorId = resolveEndpointCommands(anchor, commands, nextId, piece, 'annotation');
  const leaderId =
    leader === undefined
      ? undefined
      : resolveEndpointCommands(leader, commands, nextId, piece, 'annotation');
  commands.push({
    id: nextId('text'),
    type: 'add_text',
    params: {
      piece,
      anchor: anchorId,
      content: DEFAULT_TEXT_CONTENT,
      alignment: 'left',
      rotation: 0,
      fontSize: DEFAULT_TEXT_SIZE,
      ...(leaderId === undefined ? {} : { leader: leaderId }),
    },
  });
  return commands;
}

/**
 * Why a picked arrow target is refused, or `null` when it is acceptable. The
 * target must differ from the anchor and sit outside the label's box and rule,
 * in the label's own rotated frame.
 */
export function leaderTargetIssue(entity: TextEntity, anchor: Vec2, target: Vec2): string | null {
  if (
    Math.abs(anchor.x - target.x) <= ENDPOINT_TOLERANCE &&
    Math.abs(anchor.y - target.y) <= ENDPOINT_TOLERANCE
  ) {
    return 'The arrow needs a different point.';
  }

  const layout = textLayout(entity, anchor)!;
  const size = entity.fontSize ?? DEFAULT_TEXT_SIZE;
  const gap = size * LEADER_RULE_GAP_RATIO;
  const left =
    entity.alignment === 'center'
      ? -layout.width / 2
      : entity.alignment === 'right'
        ? -layout.width
        : 0;
  const cos = Math.cos(layout.rotation);
  const sin = Math.sin(layout.rotation);
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;

  const inside =
    localX >= left && localX <= left + layout.width && localY >= -layout.height && localY <= gap;
  return inside ? 'Choose a point outside the label.' : null;
}

/** The first reason a label's text cannot be stored, or `null` when it can. */
export function textContentError(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) return 'Enter some text.';
  if (trimmed.length > MAX_TEXT_LENGTH) return `Use at most ${MAX_TEXT_LENGTH} characters.`;
  if (/[\r\n]/.test(trimmed)) return 'Labels are one line.';
  return null;
}
