import type { Command, EntityId } from '@sewcraft/geometry';

import { resolveEndpointCommands, type DraftingEndpoint } from './drafting';

export { ENDPOINT_TOLERANCE } from './drafting';

/**
 * One end of a line being drawn: a document point reused by id, or a snapped
 * coordinate that only becomes a point when the line commits. Alias of the shared
 * {@link DraftingEndpoint}, kept so existing Line-tool call sites keep reading
 * naturally.
 */
export type LineEndpoint = DraftingEndpoint;

export {
  resolveDraftingEndpoint as resolveLineEndpoint,
  sameDraftingEndpoint as sameEndpoint,
} from './drafting';

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

  const startId = resolveEndpointCommands(start, commands, nextId);
  const endId = resolveEndpointCommands(end, commands, nextId);
  commands.push({ id: nextId('line'), type: 'add_line', params: { start: startId, end: endId } });

  return commands;
}
