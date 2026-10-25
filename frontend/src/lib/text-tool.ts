import {
  DEFAULT_TEXT_SIZE,
  MAX_TEXT_LENGTH,
  type Command,
  type EntityId,
} from '@sewcraft/geometry';

import { resolveEndpointCommands, type DraftingEndpoint } from './drafting';

/** The word a freshly placed label starts with, selected for immediate editing. */
export const DEFAULT_TEXT_CONTENT = 'Text';

/**
 * The command batch for one Annotation-text click: an `add_point` when the click
 * lands on bare canvas, then one `add_text` with the same defaults the properties
 * panel edits. A second click reuses the dodged point by id through
 * {@link resolveEndpointCommands}.
 */
export function buildTextCommands(
  anchor: DraftingEndpoint,
  piece: EntityId,
  nextId: (prefix: string) => EntityId,
): Command[] {
  const commands: Command[] = [];
  const anchorId = resolveEndpointCommands(anchor, commands, nextId, piece);
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
    },
  });
  return commands;
}

/** The first reason a label's text cannot be stored, or `null` when it can. */
export function textContentError(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) return 'Enter some text.';
  if (trimmed.length > MAX_TEXT_LENGTH) return `Use at most ${MAX_TEXT_LENGTH} characters.`;
  if (/[\r\n]/.test(trimmed)) return 'Labels are one line.';
  return null;
}
