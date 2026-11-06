import type { Command, Vec2 } from '@sewcraft/geometry';

/**
 * Commands whose params carry a position in the space the canvas is showing.
 * Every other command names entities or carries a length, so translation leaves
 * it unchanged.
 */
const POSITIONAL_COMMANDS = new Set<Command['type']>(['add_point', 'move_point']);

/**
 * Translate one command from the shared sketch space into the target piece's
 * local space. The document never stores shared coordinates: the sketch canvas
 * adds a piece's placement on read and this removes it again on write.
 */
export function localizeCommand(command: Command, offset: Vec2): Command {
  if (!POSITIONAL_COMMANDS.has(command.type)) return command;
  const params = command.params as { x: number; y: number };
  return {
    ...command,
    params: { ...params, x: params.x - offset.x, y: params.y - offset.y },
  } as Command;
}

/** Translate a batch of commands; an origin offset returns the batch untouched. */
export function localizeCommands(commands: Command[], offset: Vec2): Command[] {
  if (offset.x === 0 && offset.y === 0) return commands;
  return commands.map((command) => localizeCommand(command, offset));
}
