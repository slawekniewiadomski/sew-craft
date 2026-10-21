import type { Command } from '@sewcraft/geometry';
import { computed } from 'vue';

import { useEditorStore } from '@/stores/editor';

/**
 * The editor's command bus: the single entry point UI code uses to read the
 * pattern document and request mutations. UI code never touches the document.
 */
export function useCommandBus() {
  const editor = useEditorStore();

  const document = computed(() => editor.document);
  const journal = computed(() => editor.journal);
  const canUndo = computed(() => editor.canUndo);
  const canRedo = computed(() => editor.canRedo);

  function dispatch(command: Command): void {
    editor.dispatch(command);
  }

  function dispatchGroup(commands: Command[]): void {
    editor.dispatchGroup(commands);
  }

  function undo(): void {
    editor.undo();
  }

  function redo(): void {
    editor.redo();
  }

  return { document, journal, canUndo, canRedo, dispatch, dispatchGroup, undo, redo };
}
