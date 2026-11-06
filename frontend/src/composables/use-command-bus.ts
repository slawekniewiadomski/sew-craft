import type { Command } from '@sewcraft/geometry';
import { computed } from 'vue';

import { localizeForSketch } from '@/lib/sketch';
import { useEditorStore } from '@/stores/editor';

export function useCommandBus() {
  const editor = useEditorStore();

  const document = computed(() => editor.document);
  const journal = computed(() => editor.journal);
  const canUndo = computed(() => editor.canUndo);
  const canRedo = computed(() => editor.canRedo);

  function dispatch(command: Command): void {
    editor.dispatch(localizeForSketch(editor, [command])[0]!);
  }

  function dispatchGroup(commands: Command[]): void {
    editor.dispatchGroup(localizeForSketch(editor, commands));
  }

  function undo(): void {
    editor.undo();
  }

  function redo(): void {
    editor.redo();
  }

  return { document, journal, canUndo, canRedo, dispatch, dispatchGroup, undo, redo };
}
