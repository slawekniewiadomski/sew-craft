import type { Command, Entity, EntityId, PatternDocument, TabRef } from '@sewcraft/geometry';
import { measurementChain, measurementChainMessage, isMeasuredVariable } from '@sewcraft/geometry';
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

import type { EditorTool } from '@/lib/editor-tools';
import { nextCommandId } from '@/lib/command-ids';
import { pieceForEntity } from '@/lib/pieces';
import { pieceTab } from '@/lib/tabs';
import type { useEditorStore } from '@/stores/editor';

type EditorStore = ReturnType<typeof useEditorStore>;

export interface MeasuredEditOptions {
  pattern: () => PatternDocument;
  editor: EditorStore;
  /** The selected entities in selection order. */
  selectedEntities: ComputedRef<Entity[]>;
  selectedEntityIds: Ref<EntityId[]>;
  activeTool: Ref<EditorTool>;
  isSketch: ComputedRef<boolean>;
  activeTab: ComputedRef<TabRef | null>;
  setActiveTab: (tab: TabRef | null) => void;
  fit: () => void;
  /** The view's command wrapper; it reports failures through `error`. */
  run: (action: () => void) => boolean;
  dispatch: (command: Command) => void;
  /** The view's error strip, read after a refused live toggle. */
  error: Ref<string | null>;
}

/**
 * Measured variables: the `$`-like edge chain the canvas highlights, and the
 * pick-as-you-click editing session that rewrites a measured variable's sources
 * through the command bus.
 *
 * Selection and the active tool stay with the view; this owns the derivation
 * from them and the editing lifecycle.
 */
export function useMeasuredEdit({
  pattern,
  editor,
  selectedEntities,
  selectedEntityIds,
  activeTool,
  isSketch,
  activeTab,
  setActiveTab,
  fit,
  run,
  dispatch,
  error,
}: MeasuredEditOptions) {
  /** The selected edges, in selection order: the only kinds a measurement reads. */
  const measuredSourceIds = computed(() =>
    selectedEntities.value
      .filter(
        (entity) =>
          entity.kind === 'line' ||
          entity.kind === 'curve' ||
          entity.kind === 'arc' ||
          entity.kind === 'circle',
      )
      .map((entity) => entity.id),
  );

  /** The ordered chain the current selection forms, or why it does not form one. */
  const measuredSelection = computed<{ chain: EntityId[] | null; problem?: string }>(() => {
    const ids = measuredSourceIds.value;
    if (ids.length === 0) {
      return { chain: null, problem: 'Select one or more connected edges first.' };
    }
    const result = measurementChain(pattern().entities, ids);
    return result.problem === undefined
      ? { chain: result.chain }
      : { chain: null, problem: measurementChainMessage(result.problem) };
  });

  /** Every variable in the document; the field is optional on a legacy document. */
  const documentVariables = computed(() => pattern().variables ?? []);

  /** The measured variable whose sources the canvas is showing, if any. */
  const highlightedVariableSlug = ref<string | null>(null);
  const highlightedVariable = computed(
    () =>
      documentVariables.value.find((variable) => variable.slug === highlightedVariableSlug.value) ??
      null,
  );
  const measuredHighlightIds = computed(() => {
    const variable = highlightedVariable.value;
    return variable !== null && isMeasuredVariable(variable) ? variable.sources : [];
  });

  /** The measured variable whose edges the canvas is picking, if any. */
  const editingMeasuredSlug = ref<string | null>(null);
  const editingMeasured = computed(
    () =>
      documentVariables.value
        .filter(isMeasuredVariable)
        .find((variable) => variable.slug === editingMeasuredSlug.value) ?? null,
  );
  const measuredEditStart = ref<EntityId[] | null>(null);
  const measuredEditMessage = ref<string | null>(null);
  /** The chips the edit bar shows for one chain, in traversal order. */
  function measuredSourceChips(sources: readonly EntityId[]): { id: EntityId; label: string }[] {
    return sources.map((id, index) => ({ id, label: `Edge ${index + 1}` }));
  }

  /** The row a Selection action would re-pick, when a measured row is highlighted. */
  const measureTarget = computed(() =>
    highlightedVariable.value !== null && isMeasuredVariable(highlightedVariable.value)
      ? highlightedVariable.value
      : null,
  );

  /** Label for the Selection action: create, or re-pick the highlighted chain. */
  const measureLabel = computed(() =>
    measureTarget.value === null
      ? 'Add as measured variable'
      : `Update sources for ${measureTarget.value.name}`,
  );

  function onHighlightVariable(slug: string | null): void {
    highlightedVariableSlug.value = slug;
  }

  /** Stop picking edges; the row keeps its last applied sources. */
  function endMeasuredEdit(): void {
    editingMeasuredSlug.value = null;
    measuredEditStart.value = null;
    measuredEditMessage.value = null;
    highlightedVariableSlug.value = null;
  }

  /** Focus the piece that owns a measured chain before its edges are picked. */
  function focusMeasuredPiece(sources: readonly EntityId[]): void {
    const piece = sources
      .map((id) => pieceForEntity(pattern(), id)?.id)
      .find((id): id is EntityId => id !== undefined);
    if (piece === undefined) return;

    if (isSketch.value) {
      editor.setSketchTarget(piece);
      return;
    }
    if (activeTab.value?.kind === 'piece' && activeTab.value.id === piece) return;
    setActiveTab(pieceTab(piece));
  }

  /** Turn the canvas into an edge picker for one measured variable. */
  function startMeasuredEdit(slug: string): void {
    if (editor.readOnly) return;
    const variable = documentVariables.value.find((candidate) => candidate.slug === slug);
    if (variable === undefined || !isMeasuredVariable(variable)) return;

    focusMeasuredPiece(variable.sources);
    editingMeasuredSlug.value = slug;
    measuredEditStart.value = [...variable.sources];
    measuredEditMessage.value = null;
    highlightedVariableSlug.value = slug;
    selectedEntityIds.value = [];
    activeTool.value = 'select';
    fit();
  }

  /**
   * Toggle one edge of the chain being edited and apply it live. A gap, a
   * duplicate, a foreign kind or an empty chain is refused with a message and
   * leaves the stored chain untouched.
   */
  function onMeasuredEdgeToggle(id: EntityId): void {
    const variable = editingMeasured.value;
    if (variable === null) return;

    const next = variable.sources.includes(id)
      ? variable.sources.filter((source) => source !== id)
      : [...variable.sources, id];
    const result = measurementChain(pattern().entities, next);
    if (result.problem !== undefined) {
      measuredEditMessage.value =
        next.length === 0
          ? 'Keep at least one edge in the measurement.'
          : measurementChainMessage(result.problem);
      return;
    }

    run(() =>
      dispatch({
        id: nextCommandId('variable'),
        type: 'update_variable',
        params: { slug: variable.slug, sources: result.chain },
      }),
    );
    measuredEditMessage.value = error.value;
  }

  /** Revert every live edge change made since the editor opened, then close it. */
  function cancelMeasuredEdit(): void {
    const variable = editingMeasured.value;
    const start = measuredEditStart.value;
    if (
      variable !== null &&
      start !== null &&
      (variable.sources.length !== start.length ||
        variable.sources.some((source, index) => source !== start[index]))
    ) {
      run(() =>
        dispatch({
          id: nextCommandId('variable'),
          type: 'update_variable',
          params: { slug: variable.slug, sources: start },
        }),
      );
    }
    endMeasuredEdit();
  }

  /** Create a measured variable from the selection, or re-pick a highlighted one. */
  function onMeasureSelection(): void {
    const chain = measuredSelection.value.chain;
    if (chain === null) return;
    const target = measureTarget.value;
    const count = documentVariables.value.length + 1;
    run(() =>
      dispatch(
        target === null
          ? {
              id: nextCommandId('variable'),
              type: 'set_variable',
              params: { name: `Measured ${count}`, kind: 'measurement', sources: chain },
            }
          : {
              id: nextCommandId('variable'),
              type: 'update_variable',
              params: { slug: target.slug, sources: chain },
            },
      ),
    );
  }

  // Undo, redo, a load or a row deletion can remove the variable being edited.
  watch(pattern, (next) => {
    if (editingMeasuredSlug.value === null) return;
    const stillMeasured = (next.variables ?? []).some(
      (variable) => variable.slug === editingMeasuredSlug.value && isMeasuredVariable(variable),
    );
    if (!stillMeasured) endMeasuredEdit();
  });

  return {
    measuredSelection,
    highlightedVariableSlug,
    measuredHighlightIds,
    editingMeasuredSlug,
    editingMeasured,
    measuredEditMessage,
    measuredSourceChips,
    measureLabel,
    onHighlightVariable,
    endMeasuredEdit,
    startMeasuredEdit,
    onMeasuredEdgeToggle,
    cancelMeasuredEdit,
    onMeasureSelection,
  };
}
