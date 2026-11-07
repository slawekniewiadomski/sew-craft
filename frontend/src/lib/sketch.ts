import {
  piecePlacement,
  type Command,
  type EntityId,
  type PatternDocument,
  type Vec2,
} from '@sewcraft/geometry';

/**
 * The editor state {@link localizeForSketch} reads: whether the Sketch canvas is
 * showing, the piece it targets, and the document that piece lives in. Structural
 * rather than the Pinia store type, so this module stays free of stores.
 */
export interface SketchLocalizationSource {
  document: PatternDocument;
  sketchView: boolean;
  sketchTarget: EntityId | null;
}

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

/**
 * Translate coordinate-bearing commands into the sketch target's local space.
 * Outside the Sketch canvas, or with no target, commands pass through.
 */
export function localizeForSketch(
  editor: SketchLocalizationSource,
  commands: Command[],
): Command[] {
  if (!editor.sketchView || editor.sketchTarget === null) return commands;
  return localizeCommands(commands, piecePlacement(editor.document, editor.sketchTarget));
}
