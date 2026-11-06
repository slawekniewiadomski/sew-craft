import {
  basicPieceForLoops,
  createEmptyDocument,
  executeCommand,
  isCut,
  normalizeCornerRounds,
  normalizeDocument,
  pieceEntities,
  type Command,
  type EntityId,
  type PatternDocument,
  type TabRef,
} from '@sewcraft/geometry';
import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';

import type { SaveOrigin } from '@/lib/autosave';
import { reconcileTab, tabIndex } from '@/lib/tabs';

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
  /** The bottom bar's active tab; `null` in a document with no tabs. */
  const activeTab = ref<TabRef | null>(null);
  /** Whether the Sketch canvas replaces the tab canvas; view state only. */
  const sketchView = ref(false);
  /** The piece new geometry goes to while the Sketch canvas is showing. */
  const sketchTarget = ref<EntityId | null>(null);

  /**
   * The piece every new entity belongs to. The Sketch canvas names it with an
   * explicit target; otherwise it is derived from the active tab, so switching
   * to an assembly tab leaves no piece editable.
   */
  const activePieceId = computed<EntityId | null>(() => {
    if (sketchView.value) return sketchTarget.value;
    return activeTab.value?.kind === 'piece' ? activeTab.value.id : null;
  });

  // A deleted target falls back to the first piece so drawing never loses its
  // destination while the Sketch canvas is open.
  watch(
    document,
    (next) => {
      const pieces = next.pieces ?? [];
      if (sketchTarget.value !== null && pieces.some((piece) => piece.id === sketchTarget.value)) {
        return;
      }
      sketchTarget.value = pieces[0]?.id ?? null;
    },
    { flush: 'sync' },
  );

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
    const previousIndex = tabIndex(before, activeTab.value);
    const result = executeCommand(before, command);

    document.value = result.document;
    activeTab.value = reconcileTab(document.value, activeTab.value, previousIndex);
    past.value = [...past.value, { command, inverse: result.inverse, before }];
    future.value = [];
  }

  /**
   * The loop-capture command a committed batch earns: when the active piece has
   * no loop yet and its own cut edges now form exactly one simple closed chain,
   * store it as an explicit `set_piece_loop` in the same journal entry. Ambiguous
   * or open geometry never captures.
   */
  function autoLoopCommand(next: PatternDocument): Command | null {
    const pieceId = activePieceId.value;
    if (pieceId === null) return null;
    const piece = next.pieces.find((candidate) => candidate.id === pieceId);
    if (piece === undefined || piece.edges.length > 0) return null;

    const owned = pieceEntities(next, pieceId)
      .filter(
        (entity) =>
          (entity.kind === 'line' || entity.kind === 'curve' || entity.kind === 'arc') &&
          isCut(entity),
      )
      .map((entity) => entity.id);
    const loops = basicPieceForLoops(next, owned);
    if (loops.length !== 1) return null;

    return {
      id: `${pieceId}:auto-loop`,
      type: 'set_piece_loop',
      params: { piece: pieceId, edges: loops[0]!, allowance: 'default' },
    };
  }

  /**
   * Apply several commands as one gesture. The batch runs on a local document
   * and is assigned only when every command succeeds, so a failure leaves both
   * the document and the history untouched. An empty batch is a no-op. A batch
   * that closes the active piece's loop also stores the loop in the same entry.
   */
  function dispatchGroup(commands: Command[]): void {
    if (readOnly.value || commands.length === 0) return;

    const before = document.value;
    const previousIndex = tabIndex(before, activeTab.value);
    let next = before;
    const applied = [...commands];
    const inverses: (Command | null)[] = [];

    for (const command of applied) {
      const result = executeCommand(next, command);
      next = result.document;
      inverses.push(result.inverse);
    }

    const capture = autoLoopCommand(next);
    if (capture !== null) {
      const result = executeCommand(next, capture);
      next = result.document;
      applied.push(capture);
      inverses.push(result.inverse);
    }

    document.value = next;
    activeTab.value = reconcileTab(document.value, activeTab.value, previousIndex);
    past.value = [
      ...past.value,
      {
        command: applied[applied.length - 1]!,
        inverse: inverses[inverses.length - 1]!,
        commands: applied,
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

    const previousIndex = tabIndex(document.value, activeTab.value);
    past.value = past.value.slice(0, -1);
    future.value = [...future.value, entry];
    document.value = entry.before;
    activeTab.value = reconcileTab(document.value, activeTab.value, previousIndex);
  }

  function redo(): void {
    if (readOnly.value) return;

    const entry = future.value[future.value.length - 1];
    if (entry === undefined) return;

    const previousIndex = tabIndex(document.value, activeTab.value);
    document.value = replay(document.value, entry);
    future.value = future.value.slice(0, -1);
    past.value = [...past.value, entry];
    activeTab.value = reconcileTab(document.value, activeTab.value, previousIndex);
  }

  function load(next: PatternDocument, preferredTab: TabRef | null = null): void {
    document.value = normalizeCornerRounds(normalizeDocument(next));
    activeTab.value = reconcileTab(document.value, preferredTab);
    past.value = [];
    future.value = [];
  }

  /** Replace the document without normalising it; only unknown schemas use this. */
  function loadRaw(next: PatternDocument): void {
    document.value = next;
    activeTab.value = next.tabs?.[0] ?? null;
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
  function markLoaded(
    next: PatternDocument,
    version: number,
    savedAt: string | null,
    preferredTab: TabRef | null = null,
  ): void {
    load(next, preferredTab);
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

  /**
   * Show the Sketch canvas. Opening from a piece tab continues that piece;
   * otherwise the last target survives, and the document watcher above keeps it
   * pointing at a piece that still exists.
   */
  function showSketch(): void {
    sketchView.value = true;
    if (activeTab.value?.kind === 'piece') sketchTarget.value = activeTab.value.id;
  }

  /** Set the sketch target; an unknown piece is refused. */
  function setSketchTarget(id: EntityId): boolean {
    if (!document.value.pieces.some((piece) => piece.id === id)) return false;
    sketchTarget.value = id;
    return true;
  }

  /** Activate one tab; a ref that is not in the document clears the tab. */
  function setActiveTab(tab: TabRef | null): void {
    sketchView.value = false;
    activeTab.value =
      tab !== null &&
      document.value.tabs.some(
        (candidate) => candidate.kind === tab.kind && candidate.id === tab.id,
      )
        ? { kind: tab.kind, id: tab.id }
        : null;
  }

  return {
    document,
    sketchView,
    sketchTarget,
    showSketch,
    setSketchTarget,
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
    activeTab,
    activePieceId,
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
    setActiveTab,
  };
});
