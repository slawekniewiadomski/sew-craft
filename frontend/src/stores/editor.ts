import {
  createEmptyDocument,
  executeCommand,
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
  /** The last command of the entry, kept for readers that expect one command. */
  command: Command;
  inverse: Command | null;
  /** Every command of a grouped gesture, in order; absent for a single dispatch. */
  commands?: Command[];
  /** The inverse of each grouped command, same order. */
  inverses?: (Command | null)[];
  before: PatternDocument;
}

function replay(document: PatternDocument, entry: JournalEntry): PatternDocument {
  const commands = entry.commands ?? [entry.command];
  return commands.reduce((current, command) => executeCommand(current, command).document, document);
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

  /**
   * Apply several commands as one gesture. The batch runs on a local document
   * and is assigned only when every command succeeds, so a failure leaves both
   * the document and the history untouched. An empty batch is a no-op.
   */
  function dispatchGroup(commands: Command[]): void {
    if (commands.length === 0) return;

    const before = document.value;
    let next = before;
    const inverses: (Command | null)[] = [];

    for (const command of commands) {
      const result = executeCommand(next, command);
      next = result.document;
      inverses.push(result.inverse);
    }

    document.value = next;
    past.value = [
      ...past.value,
      {
        command: commands[commands.length - 1]!,
        inverse: inverses[inverses.length - 1]!,
        commands,
        inverses,
        before,
      },
    ];
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

    document.value = replay(document.value, entry);
    future.value = future.value.slice(0, -1);
    past.value = [...past.value, entry];
  }

  function load(next: PatternDocument): void {
    document.value = next;
    past.value = [];
    future.value = [];
  }

  return {
    document,
    journal: past,
    future,
    canUndo,
    canRedo,
    dispatch,
    dispatchGroup,
    undo,
    redo,
    load,
  };
});
