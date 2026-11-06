import { piecePlacement, type Command } from '@sewcraft/geometry';

import type { useEditorStore } from '@/stores/editor';
import { localizeCommands } from '@/lib/sketch';

type EditorStore = ReturnType<typeof useEditorStore>;

/**
 * Translate coordinate-bearing commands into the sketch target's local space.
 * Outside the Sketch canvas, or with no target, commands pass through.
 */
export function localizeForSketch(editor: EditorStore, commands: Command[]): Command[] {
  if (!editor.sketchView || editor.sketchTarget === null) return commands;
  return localizeCommands(commands, piecePlacement(editor.document, editor.sketchTarget));
}
