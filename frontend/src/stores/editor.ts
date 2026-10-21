import {
  createEmptyDocument,
  executeCommand,
  normalizeCornerRounds,
  type Command,
  type PatternDocument,
} from '@sewcraft/geometry';
import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';

/**
 * One committed command. `before` is the exact document the command was applied
 * to, which is what makes undo lossless: `delete_entity` and `solve` have no
 * inverse command (`inverse === null`), so the snapshot is the only way back.
 */
export interface JournalEntry {
  command: Command;
  inverse: Command | null;
  before: PatternDocument;
}

export const useEditorStore = defineStore('editor', () => {
  const document = shallowRef<PatternDocument>(createEmptyDocument());
  const past = shallowRef<JournalEntry[]>([]);
  const future = shallowRef<JournalEntry[]>([]);

  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  /**
   * The only mutation path. Applies and solves the command before touching
   * state, so a rejected or non-converged command leaves the store untouched.
   */
  function dispatch(command: Command): void {
    const before = document.value;
    const result = executeCommand(before, command);

    document.value = result.document;
    past.value = [...past.value, { command, inverse: result.inverse, before }];
    future.value = [];
  }

  function undo(): void {
    const entry = past.value[past.value.length - 1];
    if (entry === undefined) return;

    past.value = past.value.slice(0, -1);
    future.value = [...future.value, entry];
    document.value = entry.before;
  }

  function redo(): void {
    const entry = future.value[future.value.length - 1];
    if (entry === undefined) return;

    const result = executeCommand(document.value, entry.command);

    document.value = result.document;
    future.value = future.value.slice(0, -1);
    past.value = [...past.value, entry];
  }

  function load(next: PatternDocument): void {
    // A hand-edited document may carry an inconsistent round; the load path
    // drops the feature once and keeps its persisted geometry as static shapes.
    document.value = normalizeCornerRounds(next);
    past.value = [];
    future.value = [];
  }

  return { document, journal: past, future, canUndo, canRedo, dispatch, undo, redo, load };
});
