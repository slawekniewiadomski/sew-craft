<script setup lang="ts">
import {
  circleGeometry,
  constraintEntityIds,
  cornerAllowanceForRound,
  cornerRounds,
  constraintOffset,
  constraintOrientation,
  cutEdges,
  derivedDimensionState,
  derivedDimensionValue,
  dimensionState,
  dimensionValue,
  findDistanceConstraint,
  getEntity,
  isConstruction,
  isDrivenDimension,
  measureLinearDimension,
  PATTERN_SCHEMA,
  documentForAssembly,
  documentForPiece,
  documentForSketch,
  pieceById,
  piecePlacement,
  pieceCutLoop,
  toSvgPiece,
  type ParamInput,
} from '@sewcraft/geometry';
import type {
  AllowanceKind,
  BandTarget,
  Assembly,
  Command,
  DerivedDistanceConstraint,
  DimensionOrientation,
  DimensionState,
  DistanceConstraint,
  EntityId,
  PatternDocument,
  Piece,
  TabRef,
} from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import { projectsApi } from '@/api/projects';
import EditorTabs from '@/components/editor/EditorTabs.vue';
import EditorTopBar from '@/components/editor/EditorTopBar.vue';
import EditorCanvas from '@/components/editor/EditorCanvas.vue';
import EditorInspector from '@/components/editor/EditorInspector.vue';
import EditorOverlays from '@/components/editor/EditorOverlays.vue';
import EditorStrips from '@/components/editor/EditorStrips.vue';
import OutlineFloat from '@/components/editor/OutlineFloat.vue';
import { pruneAllowanceTargets } from '@/lib/allowance-edit';
import { useCommandBus } from '@/composables/use-command-bus';
import { useReferencePicker } from '@/composables/use-reference-picker';
import { useVariablePicker } from '@/composables/use-variable-picker';
import { useSidebarLayout } from '@/composables/use-sidebar-layout';
import { defaultAllowanceSummary } from '@/lib/allowance-defaults';
import { parseAllowanceWidth } from '@/lib/allowance-width';
import { formulaIssue, insertVariableToken, variableOptions, variableQuery } from '@/lib/formula';
import { nextCommandId } from '@/lib/command-ids';
import type { VariableValueInput } from '@/lib/variables';
import {
  DIMENSION_ORIENTATION_OPTIONS,
  anchorLabel,
  dimensionPatchForEdit,
  dimensionRows,
  dimensionStateLabel,
  dimensionTone,
  formatDimensionField,
  formatDimensionValue,
  parseDimensionEdit,
  parseDimensionValue,
  type DimensionRow,
} from '@/lib/dimensions';

import { downloadSvgFile } from '@/lib/download';
import { isEditableTarget } from '@/lib/dom';
import {
  readDisplaySettings,
  writeDisplaySettings,
  type AssemblyDisplaySettings,
  type CanvasDisplayItem,
  type DisplaySettings,
  type ExportSettings,
  type PieceDisplaySettings,
} from '@/lib/display-settings';
import type { RibbonAction } from '@/lib/editor-ribbon';
import type { PanelId } from '@/lib/editor-panels';
import { EDITOR_TOOLS, type EditorTool } from '@/lib/editor-tools';
import { entityProperties } from '@/lib/entity-properties';
import {
  canonicalCutAnchors,
  canEditEntity,
  findDerivedDimension,
  pieceForEntity,
  pieceLabel,
  pieceMarkRows,
  pieceSizeLine,
  pieceSummaries,
  pieceTitleLine,
} from '@/lib/pieces';
import {
  applySelection,
  orphanedEdges,
  selectionModeFrom,
  toggleSelection,
  type SelectionMode,
} from '@/lib/selection';
import type { ProjectSettingsDraft } from '@/components/dialogs/ProjectSettingsDialog.vue';
import { assemblyTab, nextPieceColor, pieceTab, tabLabel, writePersistedTab } from '@/lib/tabs';
import { useAssemblyEditing } from '@/composables/use-assembly-editing';
import { useMeasuredEdit } from '@/composables/use-measured-edit';
import { usePieceEditing } from '@/composables/use-piece-editing';
import { useProjectSession } from '@/composables/use-project-session';
import { useSketchCommands } from '@/composables/use-sketch-commands';
import { useToolPrompts } from '@/composables/use-tool-prompts';
import { useEditorStore } from '@/stores/editor';

const props = defineProps<{ id: string }>();

const {
  document: pattern,
  journal,
  canUndo,
  canRedo,
  dispatch,
  dispatchGroup,
  undo,
  redo,
} = useCommandBus();
const editor = useEditorStore();

const error = ref<string | null>(null);

const {
  loadState,
  loadError,
  project,
  settingsOpen,
  settingsSaving,
  settingsError,
  pendingUpgrade,
  conflict,
  dialogOpen,
  saveBarState,
  autosave,
  save,
  reloadFromConflict,
  overwrite,
  openReadOnlyDocument,
  cancelUpgrade,
} = useProjectSession({
  projectId: () => props.id,
  editor,
  pattern: () => pattern.value,
  reportError: (message) => {
    error.value = message;
  },
});

const { width, collapsed, setWidth, toggleCollapsed } = useSidebarLayout(window.localStorage);
const activeTool = ref<EditorTool>('select');
/** Ordered, ephemeral selection: never written to the document or journal. */
const selectedEntityIds = ref<EntityId[]>([]);
/** Allowance regions picked on the band; view state, never stored. */
const selectedAllowanceTargets = ref<BandTarget[]>([]);
/**
 * Ordered, ephemeral dimension selection. Dimensions are constraints, not
 * entities, so they keep a separate selection. A click or drawer row keeps the
 * two kinds exclusive; only a committed marquee may fill both.
 */
const selectedDimensionIds = ref<EntityId[]>([]);
/** The active tab, mirrored from the store; switching it is view state only. */
const activeTab = computed(() => editor.activeTab);
/** Whether the shared Sketch canvas is showing instead of a tab canvas. */
const isSketch = computed(() => editor.sketchView);
const isAssemblyTab = computed(() => !isSketch.value && activeTab.value?.kind === 'assembly');
/** The piece every new entity belongs to, derived from the active tab. */
const activePieceId = computed(() => editor.activePieceId);
const activePiece = computed(
  () => pattern.value.pieces.find((piece) => piece.id === activePieceId.value) ?? null,
);
const activePieceSummary = computed(() => {
  /* v8 ignore start -- the sidebar renders the card only with an active piece */
  if (activePiece.value === null) return null;
  /* v8 ignore stop */
  const summary = pieceSummaries(pattern.value).find(
    (candidate) => candidate.id === activePiece.value!.id,
  );
  /* v8 ignore next -- the active piece is always summarised */
  return summary ?? null;
});
/** The marks the piece card lists, resolved from the document on every read. */
const activePieceMarks = computed(() =>
  /* v8 ignore next -- the piece card renders only with an active piece */
  activePiece.value === null ? [] : pieceMarkRows(pattern.value, activePiece.value),
);

/** The assembly the active tab shows, or `null` on a piece tab. */
const activeAssembly = computed<Assembly | null>(() => {
  const tab = activeTab.value;
  /* v8 ignore start -- an assembly tab always names an existing assembly */
  if (tab === null || tab.kind !== 'assembly') return null;
  /* v8 ignore stop */
  const assembly = pattern.value.assemblies.find((candidate) => candidate.id === tab.id);
  /* v8 ignore next -- the tab names an existing assembly */
  return assembly ?? null;
});
/** The selected instance in the assembly tab; ephemeral like the entity selection. */
const selectedInstanceId = ref<EntityId | null>(null);
const {
  assemblyPickerOpen,
  selectInstance,
  onMoveInstance,
  onNudgeInstance,
  onRemoveInstance,
  onAddInstance,
  onTransformInstance,
  onUpdateInstance,
  onUpdateAssembly,
} = useAssemblyEditing({
  activeAssembly,
  selectedInstanceId,
  selectedEntityIds,
  selectedDimensionIds,
  run,
  dispatch,
});

/** The active tab is a view preference, persisted per pattern. */
watch(activeTab, (tab) => writePersistedTab(window.localStorage, props.id, tab));
/** True while a marquee owns the pointer, so Delete/Escape defer to the canvas. */
const marqueeActive = ref(false);
const fitToken = ref(0);
/**
 * Canvas and export preferences, persisted per project. The document never
 * records them: hiding a layer is presentation, not a command.
 */
const display = ref<DisplaySettings>(readDisplaySettings(window.localStorage, props.id));
watch(display, (value) => writeDisplaySettings(window.localStorage, props.id, value), {
  deep: true,
});

const PIECE_DISPLAY_ITEMS: CanvasDisplayItem[] = [
  { key: 'construction', label: 'Construction' },
  { key: 'allowances', label: 'Allowances' },
  { key: 'constraints', label: 'Constraints' },
  { key: 'dimensions', label: 'Dimensions' },
];

const ASSEMBLY_DISPLAY_ITEMS: CanvasDisplayItem[] = [
  { key: 'cutShapes', label: 'Cut shapes' },
  { key: 'allowances', label: 'Allowances' },
  { key: 'stitch', label: 'Stitch lines' },
  { key: 'folds', label: 'Fold lines' },
  { key: 'notches', label: 'Notches' },
  { key: 'labels', label: 'Piece labels' },
];

const displayItems = computed(() =>
  isAssemblyTab.value ? ASSEMBLY_DISPLAY_ITEMS : PIECE_DISPLAY_ITEMS,
);
const displayValues = computed<Record<string, boolean>>(() =>
  isAssemblyTab.value ? { ...display.value.assembly } : { ...display.value.piece },
);

function toggleDisplay(key: string, value: boolean): void {
  if (isAssemblyTab.value) {
    const assembly: AssemblyDisplaySettings = { ...display.value.assembly, [key]: value };
    display.value = { ...display.value, assembly };
    return;
  }
  const piece: PieceDisplaySettings = { ...display.value.piece, [key]: value };
  display.value = { ...display.value, piece };
}

function updateExportSettings(settings: ExportSettings): void {
  display.value = { ...display.value, export: settings };
}

/** The export dialog is a deliberate step: the ribbon opens it, Download confirms. */
const exportOpen = ref(false);

const {
  activeConstraint,
  constraintPicks,
  constraintRejectionMessage,
  cornerRoundPicks,
  cornerRoundRejectionMessage,
  cornerRoundPreviewRadius,
  constraintPromptText,
  constraintValueReady,
  constraintInitial,
  cornerRoundActive,
  cornerRoundMax,
  cornerRoundReady,
  cornerRoundPromptText,
  cornerRoundInitial,
  exitConstraint,
  exitCornerRound,
  selectConstraint,
  onConstraintPick,
  applyConstraintValue,
  onRoundCornerPick,
  applyCornerRound,
} = useToolPrompts({
  pattern: () => pattern.value,
  activeTool,
  selectedEntityIds,
  activePieceId,
  run,
  dispatch,
});

/**
 * Construction geometry is presentation only: hiding it filters what is drawn
 * without touching the document, so the toggle never changes the model.
 */
/**
 * The piece canvas only ever sees the active piece: the cross-piece edit path
 * is gone rather than refused, so every hit is editable.
 */
const pieceDocument = computed(() => {
  // The Sketch canvas shows every piece at its placement, in shared coordinates.
  if (isSketch.value) return documentForSketch(pattern.value);
  /* v8 ignore start -- the canvas only renders with a piece tab */
  if (activePieceId.value === null) return pattern.value;
  /* v8 ignore stop */
  return documentForPiece(pattern.value, activePieceId.value);
});

const visibleDocument = computed(() =>
  display.value.piece.construction
    ? pieceDocument.value
    : {
        ...pieceDocument.value,
        entities: pieceDocument.value.entities.filter((entity) => !isConstruction(entity)),
      },
);

/**
 * The document whose coordinates the canvas's pointer math uses: the shared
 * sketch document when that canvas is showing, otherwise the full piece document
 * (the visible slice drops construction geometry and could lose an unowned point).
 */
const interactionDocument = computed(() =>
  isSketch.value ? visibleDocument.value : pattern.value,
);

/** The assembly canvas's slice: the pieces its instances reference. */
const assemblyDocument = computed(() => {
  /* v8 ignore start -- evaluated only while an assembly tab is active */
  if (activeAssembly.value === null) return pattern.value;
  /* v8 ignore stop */
  return documentForAssembly(pattern.value, activeAssembly.value.id);
});

const cutEdgeCount = computed(() => cutEdges(pattern.value).length);

/** The single-entity inspector view model; `null` for zero or many selected. */
const selectedEntity = computed(() =>
  selectedEntityIds.value.length === 1
    ? entityProperties(pattern.value, selectedEntityIds.value[0]!)
    : null,
);

const defaultAllowance = computed(() => defaultAllowanceSummary(pattern.value));
/** The entity selection as a set, for row highlighting and `aria-current`. */
const selectedIds = computed(() => new Set(selectedEntityIds.value));

/** The most recently selected entity or dimension, so the outline can reveal it. */
const outlineFocusId = computed(
  () => selectedEntityIds.value.at(-1) ?? selectedDimensionIds.value.at(-1) ?? null,
);

/** The dimension selection as a set, for drawer row highlighting. */
const selectedDimensionIdSet = computed(() => new Set(selectedDimensionIds.value));

/** Every piece, in document order, as the Pieces drawer lists them. */
const pieces = computed(() => pieceSummaries(pattern.value));

/** Per-drawer row counts for the header badges; the View drawer has none. */
const panelCounts = computed<Partial<Record<PanelId, number>>>(() => ({
  properties: selectedEntityIds.value.length + selectedDimensionIds.value.length,
  pieces: pieces.value.length,
  dimensions: dimensions.value.length,
  constraints: otherConstraints.value.length,
  variables: (pattern.value.variables ?? []).length,
}));

/** The selected entities in selection order, for the multi-selection summary. */
const selectedEntities = computed(() =>
  selectedEntityIds.value.flatMap((id) => {
    const entity = getEntity(pattern.value, id);
    return entity === undefined ? [] : [entity];
  }),
);

const {
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
} = useMeasuredEdit({
  pattern: () => pattern.value,
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
});

/** Edges a bulk Delete would orphan; a non-empty list disables the action. */
const orphanCandidates = computed(() => orphanedEdges(pattern.value, selectedEntityIds.value));

/** The Delete tooltip that explains a refused bulk delete. */
const orphanHint = computed(() =>
  orphanCandidates.value.length === 0
    ? undefined
    : `Include ${orphanCandidates.value.join(', ')} in the selection to delete these points.`,
);

/** Live-region text, announced whenever the selection count changes. */
const selectionStatus = computed(() => {
  const dimensions = selectedDimensionIds.value.length;
  const entities = selectedEntityIds.value.length;
  const regions = selectedAllowanceTargets.value.length;
  if (regions > 0) {
    return regions === 1 ? '1 region selected' : `${regions} regions selected`;
  }
  if (dimensions > 0 && entities > 0) {
    return `${entities} ${entities === 1 ? 'entity' : 'entities'} and ${dimensions} ${
      dimensions === 1 ? 'dimension' : 'dimensions'
    } selected`;
  }
  if (dimensions > 0) {
    return dimensions === 1 ? '1 dimension selected' : `${dimensions} dimensions selected`;
  }
  return entities === 1 ? '1 entity selected' : `${entities} entities selected`;
});

/** Every dimension row the drawer lists, in document order. */
const dimensions = computed<DimensionRow[]>(() => dimensionRows(pattern.value));

const otherConstraints = computed(() =>
  pattern.value.constraints.filter(
    (constraint) => constraint.type !== 'distance' && constraint.type !== 'derived_distance',
  ),
);

const activeToolLabel = computed(
  () => EDITOR_TOOLS.find((tool) => tool.id === activeTool.value)!.label,
);

/** Add a variable with a unique placeholder name; the panel renames it inline. */
function onAddVariable(): void {
  const count = (pattern.value.variables ?? []).length + 1;
  run(() =>
    dispatch({
      id: nextCommandId('variable'),
      type: 'set_variable',
      params: { name: `Variable ${count}`, value: 0 },
    }),
  );
}

function onRenameVariable(slug: string, name: string): void {
  run(() =>
    dispatch({
      id: nextCommandId('variable'),
      type: 'update_variable',
      params: { slug, name },
    }),
  );
}

function onSetVariableValue(slug: string, value: VariableValueInput): void {
  run(() =>
    dispatch({
      id: nextCommandId('variable'),
      type: 'update_variable',
      params: { slug, value },
    }),
  );
}

function onSetVariableUnit(slug: string, unit: 'mm' | 'cm'): void {
  run(() =>
    dispatch({
      id: nextCommandId('variable'),
      type: 'update_variable',
      params: { slug, unit },
    }),
  );
}

function onSetVariableComment(slug: string, comment: string | null): void {
  run(() =>
    dispatch({
      id: nextCommandId('variable'),
      type: 'update_variable',
      params: { slug, comment },
    }),
  );
}

function onRemoveVariable(slug: string): void {
  run(() => dispatch({ id: nextCommandId('variable'), type: 'remove_variable', params: { slug } }));
}

function run(action: () => void): boolean {
  try {
    error.value = null;
    action();
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Command failed';
    return false;
  }
}

function selectTool(tool: EditorTool): void {
  if (editingMeasuredSlug.value !== null) endMeasuredEdit();
  exitConstraint();
  exitCornerRound();
  activeTool.value = activeTool.value === tool ? 'select' : tool;
}

function fit(): void {
  fitToken.value += 1;
}

/** Open the export dialog, which confirms with the stored layer choices. */
function openExport(): void {
  /* v8 ignore next -- the ribbon action is disabled without a piece loop */
  if (!canExport.value) return;
  exportOpen.value = true;
}

/** Export the active piece only; an assembly tab or a broken loop refuses. */
function downloadSvg(): void {
  /* v8 ignore next -- export is disabled without an active piece */
  if (activePiece.value === null) return;
  downloadSvgFile(
    `pattern-${props.id}.svg`,
    toSvgPiece(pattern.value, activePiece.value, {
      construction: display.value.export.construction,
      stitch: display.value.export.stitch,
      fold: display.value.export.fold,
    }),
  );
  exportOpen.value = false;
}

/** The piece name shown in the export dialog. */
const activePieceLabel = computed(() =>
  /* v8 ignore next -- the dialog renders only while a piece tab is active */
  activeTab.value === null ? '' : tabLabel(pattern.value, activeTab.value),
);

/** Whether the Export action can run on the current tab. */
const canExport = computed(
  () => activePiece.value !== null && pieceCutLoop(pattern.value, activePiece.value) !== null,
);

const exportHint = computed(() =>
  isAssemblyTab.value ? 'Switch to a piece to export' : 'Capture a cut loop before exporting',
);

/** Create an empty piece with the next palette colour and switch to its tab. */
function newPiece(): void {
  const id = nextCommandId('piece');
  const name = `Piece ${pattern.value.pieces.length + 1}`;
  if (
    run(() =>
      dispatch({
        id,
        type: 'create_piece',
        params: { name, color: nextPieceColor(pattern.value) },
      }),
    )
  ) {
    setActiveTab(pieceTab(id));
  }
}

/** Create an empty assembly and switch to its tab. */
function newAssembly(): void {
  const id = nextCommandId('assembly');
  if (run(() => dispatch({ id, type: 'create_assembly', params: {} }))) {
    setActiveTab(assemblyTab(id));
  }
}

/**
 * Activate one tab. A tab switch is view state only: it cancels an armed
 * gesture, clears both selections and fits the canvas.
 */
function setActiveTab(tab: TabRef | null): void {
  endMeasuredEdit();
  editor.setActiveTab(tab);
  selectedEntityIds.value = [];
  selectedDimensionIds.value = [];
  selectedInstanceId.value = null;
  assemblyPickerOpen.value = false;
  exitConstraint();
  exitCornerRound();
  activeTool.value = 'select';
  fit();
}

/** The Sketch canvas's own Arrange mode; local view state, never stored. */
const sketchArrange = ref(false);

/**
 * Open the shared Sketch canvas. The piece the user was editing becomes the
 * target, so drawing continues where they left off; the view fits every piece.
 */
function openSketch(): void {
  editor.showSketch();
  selectedEntityIds.value = [];
  selectedDimensionIds.value = [];
  selectedInstanceId.value = null;
  assemblyPickerOpen.value = false;
  exitConstraint();
  exitCornerRound();
  activeTool.value = 'select';
  fit();
}

/** The Sketch canvas switched its target piece (a picker choice or a click). */
function onSketchTarget(id: EntityId): void {
  if (!isSketch.value) return;
  if (!editor.setSketchTarget(id)) return;
  selectedEntityIds.value = [];
  selectedDimensionIds.value = [];
}

/**
 * Keep selection inside one piece on the Sketch canvas: the piece that owns the
 * first selected entity becomes the target and everything else is dropped.
 */
function onSelectEntities(ids: EntityId[]): void {
  if (!isSketch.value) {
    selectedEntityIds.value = ids;
    return;
  }
  if (ids.length === 0) {
    selectedEntityIds.value = [];
    return;
  }

  const owner =
    ids
      .map((id) => pieceForEntity(pattern.value, id)?.id)
      .find((id): id is EntityId => id !== undefined) ?? null;
  if (owner !== null) editor.setSketchTarget(owner);
  const target = owner ?? editor.sketchTarget;
  selectedEntityIds.value =
    target === null ? ids : ids.filter((id) => pieceForEntity(pattern.value, id)?.id === target);
}

/** Arrange mode moves a whole piece; geometry is never touched. */
function onMovePiece(dx: number, dy: number): void {
  const piece = editor.sketchTarget;
  if (!isSketch.value || piece === null) return;

  const current = piecePlacement(pattern.value, piece);
  run(() =>
    dispatch({
      id: nextCommandId('place'),
      type: 'place_piece',
      params: { id: piece, x: current.x + dx, y: current.y + dy },
    }),
  );
}

watch(isSketch, (on) => {
  if (!on) sketchArrange.value = false;
});

function onReorderTabs(tabs: TabRef[]): void {
  run(() => dispatch({ id: nextCommandId('tabs'), type: 'reorder_tabs', params: { tabs } }));
}

/** Switch from an assembly's piece section to that piece's own tab. */
function openPieceTab(piece: EntityId): void {
  setActiveTab(pieceTab(piece));
}

const {
  applyDefaultAllowance,
  onSetAllAllowances,
  onSetRole,
  onUpdateText,
  setCutLoop,
  clearCutLoop,
  onUpdatePiece,
  onSetPieceAllowance,
  onSetPieceCornerAllowance,
  onApplyAllowances,
  onSetPieceDefault,
  onRemovePiece,
} = usePieceEditing({
  pattern: () => pattern.value,
  defaultAllowance,
  activePiece,
  selectedAllowanceTargets,
  selectedEntityIds,
  selectedInstanceId,
  setActiveTab,
  run,
  dispatch,
  dispatchGroup,
  error,
});

/** Open the settings modal for the loaded project. */
function openSettings(): void {
  settingsError.value = null;
  settingsOpen.value = true;
}

/**
 * Persist the modal in one step: metadata over HTTP, the allowance as a
 * document command. The modal closes before the command so autosave re-arms.
 */
async function onSaveSettings(draft: ProjectSettingsDraft): Promise<void> {
  const current = project.value;
  /* v8 ignore next -- the dialog renders only while a project is loaded */
  if (current === null) return;

  settingsSaving.value = true;
  settingsError.value = null;

  try {
    if (draft.name !== current.name || draft.description !== current.description) {
      const response = await projectsApi.update(current.id, {
        name: draft.name,
        description: draft.description,
      });
      project.value = response.data;
    }

    settingsOpen.value = false;
    if (draft.allowance !== null) applyDefaultAllowance(draft.allowance);
  } catch (cause) {
    settingsError.value =
      cause instanceof Error ? cause.message : 'Failed to save project settings';
  } finally {
    settingsSaving.value = false;
  }
}

/**
 * Select one Outline row's entity with the canvas' modifier rules: plain click
 * replaces, Ctrl/Cmd toggles, Ctrl/Cmd+Shift (or Alt) subtracts.
 */
function onOutlineSelect(ids: EntityId[], mode: SelectionMode): void {
  // A drawer click is exclusive like a canvas click: the marquee is the only
  // gesture that may leave both kinds selected.
  selectedDimensionIds.value = [];
  if (mode === 'replace') {
    selectedEntityIds.value = ids;
    return;
  }
  selectedEntityIds.value =
    mode === 'add'
      ? ids.reduce((selection, id) => toggleSelection(selection, id), selectedEntityIds.value)
      : applySelection(selectedEntityIds.value, ids, 'subtract');
}

/**
 * Select one dimension from its Dimensions drawer row with the same modifier
 * rules as the canvas: plain click replaces, Ctrl/Cmd toggles, Ctrl/Cmd+Shift
 * (or Alt) subtracts.
 */
function onDimensionSelect(id: EntityId, mode: SelectionMode): void {
  // A drawer click is exclusive like a canvas click, whatever the modifier.
  selectedEntityIds.value = [];
  if (mode === 'replace') {
    selectedDimensionIds.value = [id];
    return;
  }
  selectedDimensionIds.value =
    mode === 'add'
      ? toggleSelection(selectedDimensionIds.value, id)
      : applySelection(selectedDimensionIds.value, [id], 'subtract');
}

/** Remove the whole selection, mixed or not, as one journal entry. */
function deleteSelected(): void {
  if (marqueeActive.value || editor.readOnly) return;

  if (isAssemblyTab.value) {
    if (selectedInstanceId.value !== null) onRemoveInstance(selectedInstanceId.value);
    return;
  }

  const dimensionIds = selectedDimensionIds.value;
  const entityIds = selectedEntityIds.value;
  if (dimensionIds.length === 0 && entityIds.length === 0) return;

  // The orphan guard protects the entity half only, and a hit refuses the whole
  // group so a mixed delete is never half-applied. The selection stays intact.
  const orphans = entityIds.length === 0 ? [] : orphanCandidates.value;
  if (orphans.length > 0) {
    error.value = `Cannot delete this selection: ${orphans.join(', ')} would lose a point. Include the edge${
      orphans.length === 1 ? '' : 's'
    } in the selection first.`;
    return;
  }

  // Dimensions first: removing a constraint before its anchor cascade keeps the
  // batch idempotent, and both kinds still land in the same journal entry.
  const commands: Command[] = [
    ...dimensionIds.map((id): Command => ({
      id: nextCommandId('constraint'),
      type: 'remove_constraint',
      params: { id },
    })),
    ...entityIds.map((id): Command => ({
      id: nextCommandId('delete'),
      type: 'delete_entity',
      params: { id },
    })),
  ];
  if (run(() => dispatchGroup(commands))) {
    selectedDimensionIds.value = [];
    selectedEntityIds.value = [];
  }
}

function onRibbonAction(action: RibbonAction): void {
  switch (action) {
    case 'undo':
      run(undo);
      break;
    case 'redo':
      run(redo);
      break;
    case 'delete':
      deleteSelected();
      break;
    case 'fit':
      fit();
      break;
    case 'set_cut_loop': {
      const pieceId = activePieceId.value;
      if (pieceId === null) {
        error.value = 'Create or select a piece first.';
      } else {
        setCutLoop(pieceId);
      }
      break;
    }
    case 'download_svg':
      openExport();
      break;
    case 'add_instance':
      assemblyPickerOpen.value = !assemblyPickerOpen.value;
      break;
    case 'mirror_instance':
      onTransformInstance('mirror');
      break;
    case 'rotate_instance':
      onTransformInstance('rotate');
      break;
  }
}

const {
  onMovePoint,
  onAddPoint,
  onAddPointOnLine,
  onSplitLine,
  onAddPointMidpoint,
  onAddLine,
  onAddArc,
  onAddCircle,
  onAddRectangle,
  onAddText,
  onSetNotchDepth,
  onDeleteMark,
  onAddNotch,
  onAddCentreLine,
  onAddCurve,
  onAddDimension,
  onAddCutDimension,
  onUpdateDimension,
} = useSketchCommands({
  pattern: () => pattern.value,
  interactionDocument,
  activePieceId,
  selectedEntityIds,
  run,
  dispatch,
  dispatchGroup,
  error,
});

function removeConstraint(id: EntityId): void {
  run(() =>
    dispatch({ id: nextCommandId('constraint'), type: 'remove_constraint', params: { id } }),
  );
}

function setCornerRoundRadius(id: EntityId, radius: ParamInput): void {
  run(() =>
    dispatch({
      id: nextCommandId('corner-round-radius'),
      type: 'set_corner_round_radius',
      params: { id, radius },
    }),
  );
}

/**
 * Edit a circle's radius. A driving centre↔rim dimension is updated in place so
 * the solver stays authoritative; otherwise the rim point moves along the
 * current centre→rim direction, keeping the centre fixed. A collapsed circle has
 * no direction, so its rim is placed due east; a dangling circle is left
 * untouched.
 */
function onSetCircleRadius(id: EntityId, radius: number): void {
  const entity = getEntity(pattern.value, id);
  if (entity === undefined || entity.kind !== 'circle') return;

  const dimension = findDistanceConstraint(pattern.value, entity.center, entity.rim);
  if (dimension !== undefined && dimension.value !== undefined) {
    onUpdateDimension(dimension.id, { value: radius });
    return;
  }

  const geometry = circleGeometry(pattern.value, entity);
  if (geometry === null) {
    const center = getEntity(pattern.value, entity.center);
    const rim = getEntity(pattern.value, entity.rim);
    if (center?.kind !== 'point' || rim?.kind !== 'point') return;
    onMovePoint(entity.rim, center.x + radius, center.y);
    return;
  }

  const { center, rim, radius: current } = geometry;
  onMovePoint(
    entity.rim,
    center.x + ((rim.x - center.x) / current) * radius,
    center.y + ((rim.y - center.y) / current) * radius,
  );
}

function removeCornerRound(id: EntityId): void {
  run(() =>
    dispatch({
      id: nextCommandId('corner-round-remove'),
      type: 'remove_corner_round',
      params: { id },
    }),
  );
}

function onKeyDown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (dialogOpen.value) return;
    save();
    return;
  }

  // A modal owns the keyboard: no Delete, Escape or tool shortcut behind it.
  if (dialogOpen.value) return;

  // The canvas owns Escape/Delete while a marquee gesture is in flight.
  if (
    marqueeActive.value &&
    (event.key === 'Escape' || event.key === 'Delete' || event.key === 'Backspace')
  ) {
    return;
  }

  if (event.key === 'Escape' && activeConstraint.value !== null) {
    event.preventDefault();
    exitConstraint();
    return;
  }

  if (event.key === 'Escape' && selectedAllowanceTargets.value.length > 0) {
    event.preventDefault();
    selectedAllowanceTargets.value = [];
    return;
  }

  if (event.key === 'Escape' && activeTool.value !== 'select') {
    event.preventDefault();
    exitCornerRound();
    activeTool.value = 'select';
    return;
  }

  if (isEditableTarget(event.target)) return;

  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    deleteSelected();
  }
}

watch(pattern, () => {
  // A terminal failure stops retrying the same document; a new change is what
  // makes the save attempt meaningful again.
  editor.clearSaveError();
  autosave.schedule();
});

// A picked entity, dimension, tool or tab owns the selection: regions step aside.
watch(selectedEntityIds, (ids) => {
  if (ids.length > 0) selectedAllowanceTargets.value = [];
});
watch(selectedDimensionIds, (ids) => {
  if (ids.length > 0) selectedAllowanceTargets.value = [];
});
watch(activePieceId, () => {
  selectedAllowanceTargets.value = [];
});
watch(activeTool, (tool) => {
  if (tool !== 'select') selectedAllowanceTargets.value = [];
});

// Drop picked regions whose edge or round the document no longer has.
watch(pattern, (next) => {
  if (selectedAllowanceTargets.value.length === 0) return;
  selectedAllowanceTargets.value = pruneAllowanceTargets(
    next,
    activePieceId.value,
    selectedAllowanceTargets.value,
  );
});

watch(pattern, (next) => {
  // Undo, redo or a load can remove a selected entity; keep only live ids.
  const surviving = selectedEntityIds.value.filter((id) => getEntity(next, id) !== undefined);
  if (surviving.length !== selectedEntityIds.value.length) {
    selectedEntityIds.value = surviving;
  }

  // The same applies to dimensions: a removed constraint drops its id.
  const survivingDimensions = selectedDimensionIds.value.filter((id) =>
    next.constraints.some((constraint) => constraint.id === id),
  );
  if (survivingDimensions.length !== selectedDimensionIds.value.length) {
    selectedDimensionIds.value = survivingDimensions;
  }

  if (
    selectedInstanceId.value !== null &&
    !next.assemblies.some((assembly) =>
      assembly.instances.some((instance) => instance.id === selectedInstanceId.value),
    )
  ) {
    selectedInstanceId.value = null;
  }
});

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <EditorTopBar
      :name="project?.name ?? ''"
      :state="saveBarState"
      :saved-at="editor.lastSavedAt"
      :origin="editor.lastSaveOrigin"
      :read-only="editor.readOnly"
      :load-state="loadState"
      @save="save"
      @settings="openSettings"
    />

    <p
      v-if="loadState === 'loading'"
      class="p-4 text-sm text-muted-foreground"
      data-testid="editor-loading"
    >
      Loading project…
    </p>

    <div v-else-if="loadState === 'error'" class="p-4 text-sm" data-testid="editor-load-error">
      <p class="text-destructive">{{ loadError }}</p>
      <RouterLink to="/projects" class="mt-2 inline-block text-primary underline">
        Back to Projects
      </RouterLink>
    </div>

    <template v-else>
      <EditorStrips
        :mode="isAssemblyTab ? 'assembly' : 'piece'"
        :active-tool="activeTool"
        :active-constraint="activeConstraint"
        :can-undo="canUndo"
        :can-redo="canRedo"
        :can-delete="
          isAssemblyTab
            ? selectedInstanceId !== null
            : selectedEntityIds.length > 0 || selectedDimensionIds.length > 0
        "
        :can-export="canExport"
        :export-hint="exportHint"
        :read-only="editor.readOnly"
        :sidebar-collapsed="collapsed"
        :pattern="pattern"
        :constraint-prompt="constraintPromptText"
        :constraint-rejection="constraintRejectionMessage"
        :constraint-value-ready="constraintValueReady"
        :constraint-initial="constraintInitial"
        :corner-round-active="cornerRoundActive"
        :corner-round-prompt="cornerRoundPromptText"
        :corner-round-rejection="cornerRoundRejectionMessage"
        :corner-round-ready="cornerRoundReady"
        :corner-round-initial="cornerRoundInitial"
        :corner-round-max="cornerRoundMax"
        :editing-measured-name="editingMeasured?.name ?? null"
        :measured-sources="editingMeasured ? measuredSourceChips(editingMeasured.sources) : []"
        :measured-message="measuredEditMessage"
        :error="error"
        :selection-status="selectionStatus"
        :is-sketch="isSketch"
        :sketch-target="editor.sketchTarget"
        :sketch-arrange="sketchArrange"
        @select-tool="selectTool"
        @select-constraint="selectConstraint"
        @action="onRibbonAction"
        @toggle-sidebar="toggleCollapsed"
        @apply-constraint="applyConstraintValue"
        @cancel-constraint="exitConstraint"
        @apply-corner="applyCornerRound"
        @cancel-corner="exitCornerRound"
        @preview-corner="cornerRoundPreviewRadius = $event"
        @remove-measured="onMeasuredEdgeToggle"
        @done-measured="endMeasuredEdit"
        @cancel-measured="cancelMeasuredEdit"
        @update:sketch-target="onSketchTarget"
        @update:sketch-arrange="sketchArrange = $event"
        @fit="fit"
      />

      <div class="flex min-h-0 flex-1">
        <div class="relative flex min-h-0 min-w-0 flex-1">
          <EditorCanvas
            v-model:selected-entity-ids="selectedEntityIds"
            v-model:selected-dimension-ids="selectedDimensionIds"
            v-model:selected-allowance-targets="selectedAllowanceTargets"
            :pattern="pattern"
            :visible-document="visibleDocument"
            :assembly-document="assemblyDocument"
            :active-assembly="activeAssembly"
            :is-assembly-tab="isAssemblyTab"
            :is-sketch="isSketch"
            :active-tool="activeTool"
            :active-piece-id="activePieceId"
            :read-only="editor.readOnly"
            :selected-instance-id="selectedInstanceId"
            :assembly-picker-open="assemblyPickerOpen"
            :fit-token="fitToken"
            :sketch-arrange="sketchArrange"
            :display="display"
            :display-items="displayItems"
            :display-values="displayValues"
            :active-constraint="activeConstraint"
            :constraint-picks="constraintPicks"
            :corner-round-active="cornerRoundActive"
            :corner-round-picks="cornerRoundPicks"
            :corner-round-preview-radius="cornerRoundPreviewRadius"
            :measured-editing="editingMeasured !== null"
            :measured-highlight-ids="measuredHighlightIds"
            @toggle-display="toggleDisplay"
            @select-instance="selectInstance"
            @move-instance="onMoveInstance"
            @nudge-instance="onNudgeInstance"
            @remove-instance="onRemoveInstance"
            @add-instance="onAddInstance"
            @close-picker="assemblyPickerOpen = false"
            @move-piece="onMovePiece"
            @activate-piece="onSketchTarget"
            @cross-piece="onSketchTarget"
            @move-point="onMovePoint"
            @add-text="onAddText"
            @add-notch="onAddNotch"
            @add-centre-line="onAddCentreLine"
            @add-point="onAddPoint"
            @add-point-on-line="onAddPointOnLine"
            @add-point-midpoint="onAddPointMidpoint"
            @split-line="onSplitLine"
            @add-line="onAddLine"
            @add-curve="onAddCurve"
            @add-arc="onAddArc"
            @add-circle="onAddCircle"
            @add-rectangle="onAddRectangle"
            @constraint-pick="onConstraintPick"
            @round-corner-pick="onRoundCornerPick"
            @set-corner-round-radius="setCornerRoundRadius"
            @add-dimension="onAddDimension"
            @add-cut-dimension="onAddCutDimension"
            @update-dimension="onUpdateDimension"
            @marquee-change="marqueeActive = $event"
            @measure-pick="onMeasuredEdgeToggle"
            @update:selected-entity-ids="onSelectEntities"
          />

          <OutlineFloat
            :document="pattern"
            :selected-ids="selectedIds"
            :selected-dimension-ids="selectedDimensionIdSet"
            :active-piece-id="activePieceId"
            :focus-id="outlineFocusId"
            @select="onOutlineSelect"
            @select-dimension="onDimensionSelect"
            @open-piece="openPieceTab"
          />
        </div>

        <EditorInspector
          :width="width"
          :collapsed="collapsed"
          :panel-counts="panelCounts"
          :pattern-id="props.id"
          :mode="isAssemblyTab ? 'assembly' : 'piece'"
          :read-only="editor.readOnly"
          :selected-dimension-ids="selectedDimensionIds"
          :selected-entity-ids="selectedEntityIds"
          :selected-entities="selectedEntities"
          :delete-disabled="orphanCandidates.length > 0"
          :delete-hint="orphanHint"
          :measure-label="measureLabel"
          :measure-disabled="measuredSelection.chain === null"
          :measure-hint="measuredSelection.problem"
          :selected-entity="selectedEntity ?? null"
          :pattern="pattern"
          :active-piece="activePiece"
          :active-piece-summary="activePieceSummary"
          :selected-allowance-targets="selectedAllowanceTargets"
          :default-allowance="defaultAllowance"
          :active-piece-marks="activePieceMarks"
          :active-assembly="activeAssembly"
          :selected-instance-id="selectedInstanceId"
          :selected-ids="selectedIds"
          :selected-dimension-id-set="selectedDimensionIdSet"
          :highlighted-variable-slug="highlightedVariableSlug"
          :editing-measured-slug="editingMeasuredSlug"
          :measured-chain-available="measuredSelection.chain !== null"
          :active-tool-label="activeToolLabel"
          :journal-length="journal.length"
          :cut-edge-count="cutEdgeCount"
          :other-constraints="otherConstraints"
          @update:width="setWidth"
          @update:collapsed="collapsed = $event"
          @delete-selected="deleteSelected"
          @measure-selection="onMeasureSelection"
          @update-dimension="onUpdateDimension"
          @remove-constraint="removeConstraint"
          @set-corner-round-radius="setCornerRoundRadius"
          @remove-corner-round="removeCornerRound"
          @set-circle-radius="onSetCircleRadius"
          @update-piece="onUpdatePiece"
          @set-piece-default="onSetPieceDefault"
          @set-piece-allowance="onSetPieceAllowance"
          @set-all-allowances="onSetAllAllowances"
          @set-piece-corner-allowance="onSetPieceCornerAllowance"
          @apply-allowances="onApplyAllowances"
          @remove-piece="onRemovePiece"
          @set-role="onSetRole"
          @update-text="onUpdateText"
          @set-cut-loop="setCutLoop"
          @clear-cut-loop="clearCutLoop"
          @delete-mark="onDeleteMark"
          @set-notch-depth="onSetNotchDepth"
          @update-assembly="onUpdateAssembly"
          @update-instance="onUpdateInstance"
          @open-piece="openPieceTab"
          @remove-instance="onRemoveInstance"
          @select-dimension="onDimensionSelect"
          @create-variable="onAddVariable"
          @rename-variable="onRenameVariable"
          @set-variable-value="onSetVariableValue"
          @set-variable-unit="onSetVariableUnit"
          @set-variable-comment="onSetVariableComment"
          @remove-variable="onRemoveVariable"
          @create-measured="onMeasureSelection"
          @highlight-variable="onHighlightVariable"
          @edit-measured="startMeasuredEdit"
        />
      </div>

      <EditorTabs
        :document="pattern"
        :model-value="isSketch ? null : activeTab"
        :sketch="isSketch"
        :read-only="editor.readOnly"
        @update:model-value="setActiveTab"
        @new-piece="newPiece"
        @new-assembly="newAssembly"
        @show-sketch="openSketch"
        @reorder="onReorderTabs"
      />

      <EditorOverlays
        :export-open="exportOpen"
        :active-piece="activePiece"
        :active-piece-label="activePieceLabel"
        :export-settings="display.export"
        :conflict="conflict"
        :settings-open="settingsOpen"
        :project="project"
        :default-allowance="defaultAllowance"
        :read-only="editor.readOnly"
        :settings-saving="settingsSaving"
        :settings-error="settingsError"
        :pending-upgrade="pendingUpgrade"
        :editor-schema="PATTERN_SCHEMA"
        @update:export-settings="updateExportSettings"
        @download="downloadSvg"
        @close-export="exportOpen = false"
        @reload-conflict="reloadFromConflict"
        @overwrite="overwrite"
        @save-settings="onSaveSettings"
        @close-settings="settingsOpen = false"
        @open-readonly="openReadOnlyDocument"
        @cancel-upgrade="cancelUpgrade"
      />
    </template>
  </section>
</template>
