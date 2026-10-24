import {
  createEmptyDocument,
  executeCommand,
  normalizeCornerRounds,
  normalizeDocument,
  type Command,
  type PatternDocument,
} from '@sewcraft/geometry';
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';

import type { SaveOrigin } from '@/lib/autosave';

/**
 * The status of the last save attempt; `idle` before the first one. `failed` is
 * retryable, `error` is terminal until the document changes, and `paused` means
 * an autosave lost the version race and waits for an explicit resolution.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'paused' | 'error';

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

  /** The exact document last loaded or saved; identity is the dirty check. */
  const savedDocument = shallowRef<PatternDocument | null>(null);
  /** True until the first save, even while the empty document is still clean. */
  const newProject = ref(true);
  /** The checkpoint the next save expects; 0 when nothing is stored yet. */
  const savedVersion = ref(0);
  const lastSavedAt = ref<string | null>(null);
  const saveState = ref<SaveState>('idle');
  /** Which writer produced the last acknowledged save; drives the bar's copy. */
  const lastSaveOrigin = ref<SaveOrigin | null>(null);
  /** Read-only documents reject every mutation, including undo and redo. */
  const readOnly = ref(false);

  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);
  const isDirty = computed(() => document.value !== savedDocument.value);
  const isNew = computed(() => newProject.value);

  /**
   * The only mutation path. Applies and solves the command before touching
   * state, so a rejected or non-converged command leaves the store untouched.
   */
  function dispatch(command: Command): void {
    if (readOnly.value) return;

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
    if (readOnly.value || commands.length === 0) return;

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
    if (readOnly.value) return;

    const entry = past.value[past.value.length - 1];
    if (entry === undefined) return;

    past.value = past.value.slice(0, -1);
    future.value = [...future.value, entry];
    document.value = entry.before;
  }

  function redo(): void {
    if (readOnly.value) return;

    const entry = future.value[future.value.length - 1];
    if (entry === undefined) return;

    document.value = replay(document.value, entry);
    future.value = future.value.slice(0, -1);
    past.value = [...past.value, entry];
  }

  function load(next: PatternDocument): void {
    // Upgrade an older document before normalising rounds: the 0.2 migration
    // adopts closed seam chains as pieces, and a hand-edited document may carry
    // an inconsistent round the load path drops once.
    document.value = normalizeCornerRounds(normalizeDocument(next));
    past.value = [];
    future.value = [];
  }

  /** Replace the document without normalising it; only unknown schemas use this. */
  function loadRaw(next: PatternDocument): void {
    document.value = next;
    past.value = [];
    future.value = [];
  }

  /** Start an unsaved project: an empty document with no stored copy. */
  function markNew(): void {
    load(createEmptyDocument());
    savedDocument.value = document.value;
    newProject.value = true;
    savedVersion.value = 0;
    lastSavedAt.value = null;
    saveState.value = 'idle';
    lastSaveOrigin.value = null;
    readOnly.value = false;
  }

  /** Adopt a stored document as the clean baseline. */
  function markLoaded(next: PatternDocument, version: number, savedAt: string | null): void {
    load(next);
    savedDocument.value = document.value;
    newProject.value = false;
    savedVersion.value = version;
    lastSavedAt.value = savedAt;
    saveState.value = 'idle';
    lastSaveOrigin.value = null;
    readOnly.value = false;
  }

  /** Adopt an unknown document as a clean, read-only baseline. */
  function markReadOnlyLoaded(
    next: PatternDocument,
    version: number,
    savedAt: string | null,
  ): void {
    loadRaw(next);
    savedDocument.value = next;
    newProject.value = false;
    savedVersion.value = version;
    lastSavedAt.value = savedAt;
    saveState.value = 'idle';
    lastSaveOrigin.value = null;
    readOnly.value = true;
  }

  function markSaving(): void {
    saveState.value = 'saving';
  }

  /**
   * Record a successful save. `next` is the exact snapshot that was sent, so
   * edits made while the request was in flight keep the document dirty.
   */
  function markSaved(
    next: PatternDocument,
    version: number,
    savedAt: string | null,
    origin: SaveOrigin = 'manual',
  ): void {
    savedDocument.value = next;
    newProject.value = false;
    savedVersion.value = version;
    lastSavedAt.value = savedAt;
    saveState.value = 'saved';
    lastSaveOrigin.value = origin;
  }

  /** A transient failure: autosave retries on a backoff ladder. */
  function markSaveFailed(): void {
    saveState.value = 'failed';
  }

  /** An autosave lost the version race; wait for an explicit Save to resolve it. */
  function markSavePaused(): void {
    saveState.value = 'paused';
  }

  /** A permanent failure (422, payload too large): no retry until the document changes. */
  function markSaveError(): void {
    saveState.value = 'error';
  }

  /** A new change makes a terminal failure retryable again. */
  function clearSaveError(): void {
    if (saveState.value === 'error') saveState.value = 'idle';
  }

  function setReadOnly(value: boolean): void {
    readOnly.value = value;
  }

  return {
    document,
    journal: past,
    future,
    canUndo,
    canRedo,
    savedDocument,
    savedVersion,
    lastSavedAt,
    saveState,
    lastSaveOrigin,
    readOnly,
    isDirty,
    isNew,
    dispatch,
    dispatchGroup,
    undo,
    redo,
    load,
    loadRaw,
    markNew,
    markLoaded,
    markReadOnlyLoaded,
    markSaving,
    markSaved,
    markSaveFailed,
    markSavePaused,
    markSaveError,
    clearSaveError,
    setReadOnly,
  };
});
