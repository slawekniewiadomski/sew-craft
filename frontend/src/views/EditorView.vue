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
  isLineAnchor,
  measureDistanceDimension,
  measureLinearDimension,
  PATTERN_SCHEMA,
  documentForAssembly,
  documentForPiece,
  documentForSketch,
  pieceById,
  piecePlacement,
  pieceCutLoop,
  seamForEdge,
  toSvgPiece,
  usesCutEdgeAnchor,
  type ParamInput,
} from '@sewcraft/geometry';
import type {
  AddConstraintParams,
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
import AssemblyCanvas from '@/components/canvas/AssemblyCanvas.vue';
import AssemblyPanel from '@/components/panels/AssemblyPanel.vue';
import CanvasDisplayMenu from '@/components/editor/CanvasDisplayMenu.vue';
import ConstraintPromptBar from '@/components/bars/ConstraintPromptBar.vue';
import CornerRoundPromptBar from '@/components/bars/CornerRoundPromptBar.vue';
import MeasuredEditBar from '@/components/bars/MeasuredEditBar.vue';
import DimensionReferencePicker from '@/components/base/DimensionReferencePicker.vue';
import EditorRibbon from '@/components/editor/EditorRibbon.vue';
import EditorSidebar from '@/components/editor/EditorSidebar.vue';
import EditorTabs from '@/components/editor/EditorTabs.vue';
import EditorTopBar from '@/components/editor/EditorTopBar.vue';
import EntityPropertiesPanel from '@/components/panels/EntityPropertiesPanel.vue';
import ExportDialog from '@/components/dialogs/ExportDialog.vue';
import ConstraintsPanel from '@/components/panels/ConstraintsPanel.vue';
import DimensionsPanel from '@/components/panels/DimensionsPanel.vue';
import OutlinePanel from '@/components/panels/OutlinePanel.vue';
import PatternCanvas from '@/components/canvas/PatternCanvas.vue';
import PiecePanel from '@/components/panels/PiecePanel.vue';
import ProjectSettingsDialog from '@/components/dialogs/ProjectSettingsDialog.vue';
import {
  allowanceEditCommands,
  pruneAllowanceTargets,
  type BulkAllowanceEdit,
} from '@/lib/allowance-edit';
import RibbonIcon from '@/components/base/RibbonIcon.vue';
import SaveConflictDialog from '@/components/dialogs/SaveConflictDialog.vue';
import SketchToolbar from '@/components/bars/SketchToolbar.vue';
import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import SidebarSelect from '@/components/sidebar/SidebarSelect.vue';
import SidebarStat from '@/components/sidebar/SidebarStat.vue';
import SelectionSummary from '@/components/editor/SelectionSummary.vue';
import VariablesPanel from '@/components/panels/VariablesPanel.vue';
import UpgradeDocumentDialog from '@/components/dialogs/UpgradeDocumentDialog.vue';
import { useCommandBus } from '@/composables/use-command-bus';
import { useReferencePicker } from '@/composables/use-reference-picker';
import { useVariablePicker } from '@/composables/use-variable-picker';
import { useSidebarLayout } from '@/composables/use-sidebar-layout';
import { defaultAllowanceSummary, type AllowanceChoice } from '@/lib/allowance-defaults';
import { parseAllowanceWidth } from '@/lib/allowance-width';
import { formulaIssue, insertVariableToken, variableOptions, variableQuery } from '@/lib/formula';
import { buildCircleCommands, type CircleEndpoint } from '@/lib/circle-tool';
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
  type DimensionPatch,
  type DimensionRow,
  type DimensionPlacement,
  type DimensionReferenceOption,
  type CutDimensionPlacement,
} from '@/lib/dimensions';
import { buildArcCommands, type ArcEndpoint } from '@/lib/arc-tool';

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
import type { DraftingEndpoint } from '@/lib/drafting';
import type { RibbonAction } from '@/lib/editor-ribbon';
import type { PanelId } from '@/lib/editor-panels';
import { EDITOR_TOOLS, type EditorTool } from '@/lib/editor-tools';
import { entityProperties } from '@/lib/entity-properties';
import { buildLineCommands, type LineEndpoint } from '@/lib/line-tool';
import { buildPointMidpointCommands } from '@/lib/point-midpoint';
import { buildPointOnLineCommands } from '@/lib/point-on-line';
import { buildSplitLineCommands } from '@/lib/split-line';
import { buildRectangleCommands, type RectangleMode } from '@/lib/rectangle-tool';
import { buildTextCommands, textContentError } from '@/lib/text-tool';
import {
  edgeLabel,
  canonicalCutAnchors,
  canEditEntity,
  findDerivedDimension,
  pieceCreationFromSelection,
  pieceForEntity,
  pieceLabel,
  pieceMarkRows,
  pieceSizeLine,
  pieceSummaries,
  pieceTitleLine,
} from '@/lib/pieces';
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';
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
import { useProjectSession } from '@/composables/use-project-session';
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

/** Every line, curve, arc and circle, so any edge can be converted between guide and cut. */
const edges = computed(() =>
  pattern.value.entities
    .filter((entity) => entity.kind !== 'point' && entity.kind !== 'text' && entity.kind !== 'mark')
    .map((entity) => {
      const seam = seamForEdge(pattern.value, entity.id);
      const piece = pattern.value.pieces.find((candidate) => candidate.edges.includes(entity.id));
      const allowance = piece?.allowances.find((candidate) => candidate.edge === entity.id);
      return {
        id: entity.id,
        kind: entity.kind,
        label: edgeLabel(pattern.value, entity.id),
        construction: isConstruction(entity),
        seamWidth: seam?.width ?? null,
        pieceId: piece?.id ?? null,
        allowanceKind: allowance === undefined ? null : (allowance.kind ?? 'seam'),
        allowanceWidth: allowance?.width ?? null,
      };
    }),
);

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

/** The dimension selection as a set, for drawer row highlighting. */
const selectedDimensionIdSet = computed(() => new Set(selectedDimensionIds.value));

/** Every piece, in document order, as the Pieces drawer lists them. */
const pieces = computed(() => pieceSummaries(pattern.value));

/** Per-drawer row counts for the header badges; the View drawer has none. */
const panelCounts = computed<Partial<Record<PanelId, number>>>(() => ({
  properties: selectedEntityIds.value.length + selectedDimensionIds.value.length,
  pieces: pieces.value.length,
  outline: edges.value.length,
  dimensions: dimensions.value.length,
  constraints: otherConstraints.value.length,
  variables: (pattern.value.variables ?? []).length,
}));

const EDGE_KIND_LABELS: Record<'line' | 'curve' | 'arc' | 'circle', string> = {
  line: 'Line',
  curve: 'Curve',
  arc: 'Arc',
  circle: 'Circle',
};

const EDGE_KIND_ICONS: Record<'line' | 'curve' | 'arc' | 'circle', RibbonIconName> = {
  line: 'line',
  curve: 'curve',
  arc: 'arc',
  circle: 'circle',
};

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

/** Capture the selected closed chain as this piece's loop. */
function setCutLoop(pieceId: EntityId): void {
  const result = pieceCreationFromSelection(pattern.value, selectedEntityIds.value, pieceId);
  if (!result.ok) {
    error.value = result.message;
    return;
  }
  if (
    run(() =>
      dispatch({
        id: nextCommandId('loop'),
        type: 'set_piece_loop',
        params: { piece: pieceId, edges: result.edges, allowance: 'default' },
      }),
    )
  ) {
    setActiveTab(pieceTab(pieceId));
  }
}

function clearCutLoop(pieceId: EntityId): void {
  run(() =>
    dispatch({
      id: nextCommandId('loop'),
      type: 'set_piece_loop',
      params: { piece: pieceId, edges: [] },
    }),
  );
}

/** Open the settings modal for the loaded project. */
function openSettings(): void {
  settingsError.value = null;
  settingsOpen.value = true;
}

/** Apply one default allowance choice as a single undoable command. */
function applyDefaultAllowance(choice: AllowanceChoice): void {
  const current = defaultAllowance.value;
  const kind = choice.kind;
  if (kind === 'none') {
    if (current.kind === 'none') return;
    run(() =>
      dispatch({
        id: nextCommandId('default-allowance'),
        type: 'set_default_allowance',
        params: { remove: true },
      }),
    );
    return;
  }

  const width = choice.width;
  if (kind === current.kind && width === current.width) return;
  run(() =>
    dispatch({
      id: nextCommandId('default-allowance'),
      type: 'set_default_allowance',
      params: { width, kind },
    }),
  );
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

/** Apply one allowance to every edge of a piece as a single journal entry. */
function onSetAllAllowances(
  pieceId: EntityId,
  value: { kind: AllowanceKind; width: number } | null,
): void {
  const piece = pattern.value.pieces.find((candidate) => candidate.id === pieceId);
  /* v8 ignore next -- the card emits only for a piece in the current document */
  if (piece === undefined) return;

  const commands: Command[] = piece.edges.map((edge) => ({
    id: nextCommandId('allowance'),
    type: 'set_piece_allowance',
    params:
      value === null
        ? { piece: pieceId, edge, remove: true }
        : { piece: pieceId, edge, width: value.width, kind: value.kind },
  }));
  run(() => dispatchGroup(commands));
}

function onSetRole(id: EntityId, role: 'cut' | 'construction' | 'annotation'): void {
  run(() => dispatch({ id: nextCommandId('role'), type: 'set_role', params: { id, role } }));
}

function onUpdateText(id: EntityId, patch: Record<string, unknown>): void {
  if (typeof patch.content === 'string') {
    const issue = textContentError(patch.content);
    if (issue !== null) {
      error.value = issue;
      return;
    }
  }
  run(() =>
    dispatch({
      id: nextCommandId('text'),
      type: 'update_text',
      params: { id, ...patch } as { id: EntityId },
    }),
  );
}

/**
 * Select one Outline row's entity with the canvas' modifier rules: plain click
 * replaces, Ctrl/Cmd toggles, Ctrl/Cmd+Shift (or Alt) subtracts.
 */
function onOutlineSelect(id: EntityId, mode: SelectionMode): void {
  // A drawer click is exclusive like a canvas click: the marquee is the only
  // gesture that may leave both kinds selected.
  selectedDimensionIds.value = [];
  if (mode === 'replace') {
    selectedEntityIds.value = [id];
    return;
  }
  selectedEntityIds.value =
    mode === 'add'
      ? toggleSelection(selectedEntityIds.value, id)
      : applySelection(selectedEntityIds.value, [id], 'subtract');
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

function onMovePoint(id: EntityId, x: number, y: number): void {
  run(() => dispatch({ id: nextCommandId('move'), type: 'move_point', params: { id, x, y } }));
}

function onAddPoint(x: number, y: number): void {
  const piece = activePieceId.value;
  run(() =>
    dispatch({
      id: nextCommandId('point'),
      type: 'add_point',
      /* v8 ignore next -- the canvas only adds points with an active piece */
      params: { x, y, ...(piece === null ? {} : { piece }) },
    }),
  );
}

/**
 * One gesture: the point at the projection and its `point_on_line` constraint,
 * as a single journal entry. `null` means the line no longer resolves, so
 * nothing is dispatched.
 */
function onAddPointOnLine(lineId: EntityId, x: number, y: number): void {
  // The canvas hands us shared-space coordinates, so resolve them against the
  // same document it draws; the bus translates the new point back afterwards.
  const commands = buildPointOnLineCommands(
    interactionDocument.value,
    lineId,
    { x, y },
    nextCommandId,
    /* v8 ignore next -- the canvas only exists inside a piece tab */
    activePieceId.value ?? undefined,
  );
  if (commands === null) return;
  run(() => dispatchGroup(commands));
}

/**
 * One gesture: split the line, creating the shared point first when the pointer
 * did not reuse an authored one. `null` means the line no longer resolves or the
 * projection is an endpoint, so nothing is dispatched.
 */
function onSplitLine(lineId: EntityId, x: number, y: number): void {
  const commands = buildSplitLineCommands(
    interactionDocument.value,
    lineId,
    { x, y },
    nextCommandId,
  );
  if (commands === null) return;
  // The original id belongs to only one half now, so a stale selection would
  // highlight the wrong edge; the user picks a half deliberately.
  selectedEntityIds.value = [];
  run(() => dispatchGroup(commands));
}

/**
 * One gesture: the point at the line's visible middle and its `midpoint`
 * relation, as a single journal entry. `null` means the line no longer resolves,
 * so nothing is dispatched.
 */
function onAddPointMidpoint(lineId: EntityId): void {
  const commands = buildPointMidpointCommands(
    pattern.value,
    lineId,
    nextCommandId,
    /* v8 ignore next -- the canvas only exists inside a piece tab */
    activePieceId.value ?? undefined,
  );
  if (commands === null) return;
  run(() => dispatchGroup(commands));
}

/** One gesture: new endpoints become points, then the line, as a single entry. */
function onAddLine(start: LineEndpoint, end: LineEndpoint): void {
  run(() =>
    /* v8 ignore next -- the canvas only exists inside a piece tab */
    dispatchGroup(buildLineCommands(start, end, nextCommandId, activePieceId.value ?? undefined)),
  );
}

/** One gesture: new endpoints become points, then the arc, as a single entry. */
function onAddArc(start: ArcEndpoint, end: ArcEndpoint, through: ArcEndpoint): void {
  run(() =>
    dispatchGroup(
      /* v8 ignore next -- the canvas only exists inside a piece tab */
      buildArcCommands(start, end, through, nextCommandId, activePieceId.value ?? undefined),
    ),
  );
}

/** One gesture: new endpoints become points, then the circle, as a single entry. */
function onAddCircle(center: CircleEndpoint, rim: CircleEndpoint): void {
  run(() =>
    dispatchGroup(
      /* v8 ignore next -- the canvas only exists inside a piece tab */
      buildCircleCommands(center, rim, nextCommandId, activePieceId.value ?? undefined),
    ),
  );
}

/**
 * One gesture: new corners become points, then the four sides and their
 * constraints, as a single entry and a single undo.
 */
function onAddRectangle(mode: RectangleMode, clicks: DraftingEndpoint[]): void {
  run(() =>
    dispatchGroup(
      buildRectangleCommands(
        pattern.value,
        mode,
        clicks,
        nextCommandId,
        /* v8 ignore next -- the canvas only exists inside a piece tab */
        activePieceId.value ?? undefined,
      ),
    ),
  );
}

function onAddText(anchor: DraftingEndpoint, leader?: DraftingEndpoint): void {
  const pieceId = activePieceId.value;
  /* v8 ignore start -- the canvas only exists inside a piece tab */
  if (pieceId === null) {
    error.value = 'Create or select a piece before placing annotation text.';
    return;
  }
  /* v8 ignore stop */
  run(() => dispatchGroup(buildTextCommands(anchor, pieceId, nextCommandId, leader)));
}

/** A notch's depth change from the piece card's mark row. */
function onSetNotchDepth(id: EntityId, depth: number | null): void {
  run(() =>
    dispatch({ id: nextCommandId('notch-depth'), type: 'update_notch', params: { id, depth } }),
  );
}

/** Delete a mark from the piece card, through the ordinary entity cascade. */
function onDeleteMark(id: EntityId): void {
  run(() => dispatch({ id: nextCommandId('delete-mark'), type: 'delete_entity', params: { id } }));
}

/** A notch on the edge the maker pointed at, placed in one command. */
function onAddNotch(point: EntityId, edge: EntityId): void {
  const pieceId = activePieceId.value;
  /* v8 ignore start -- the canvas only exists inside a piece tab */
  if (pieceId === null) return;
  /* v8 ignore stop */
  run(() =>
    dispatch({
      id: nextCommandId('notch'),
      type: 'add_notch',
      params: { piece: pieceId, edge, point },
    }),
  );
}

/** A centre line between the two snapped points of the gesture. */
function onAddCentreLine(start: EntityId, end: EntityId): void {
  const pieceId = activePieceId.value;
  /* v8 ignore start -- the canvas only exists inside a piece tab */
  if (pieceId === null) return;
  /* v8 ignore stop */
  run(() =>
    dispatch({
      id: nextCommandId('centre-line'),
      type: 'add_centre_line',
      params: { piece: pieceId, start, end },
    }),
  );
}

function onAddCurve(points: [EntityId, EntityId, EntityId, EntityId]): void {
  run(() =>
    dispatchGroup([
      {
        id: nextCommandId('curve'),
        type: 'add_curve',
        params: {
          p0: points[0],
          p1: points[1],
          p2: points[2],
          p3: points[3],
          /* v8 ignore next -- the canvas only exists inside a piece tab */
          ...(activePieceId.value === null ? {} : { piece: activePieceId.value }),
        },
      },
    ]),
  );
}

/**
 * Place a dimension as a driven distance constraint: it measures the span and
 * adds no equation. Reusing an existing distance between the same two points
 * avoids duplicates and keeps that dimension's driven/set state; the placement
 * then only updates its presentation.
 */
function onAddDimension(placement: DimensionPlacement): void {
  const orientation =
    isLineAnchor(pattern.value, placement.a) || isLineAnchor(pattern.value, placement.b)
      ? 'aligned'
      : placement.orientation;
  const existing = findDistanceConstraint(pattern.value, placement.a, placement.b);
  if (existing !== undefined) {
    run(() =>
      dispatch({
        id: nextCommandId('dimension'),
        type: 'update_constraint',
        params: { id: existing.id, orientation, offset: placement.offset },
      }),
    );
    return;
  }

  const measured = measureDistanceDimension(pattern.value, {
    id: placement.a,
    type: 'distance',
    a: placement.a,
    b: placement.b,
    orientation,
  });
  if (measured === null || measured <= 0) return;

  run(() =>
    dispatch({
      id: nextCommandId('dimension'),
      type: 'add_constraint',
      params: {
        type: 'distance',
        entities: [placement.a, placement.b],
        orientation,
        offset: placement.offset,
        /* v8 ignore next -- the canvas only exists inside a piece tab */
        ...(activePieceId.value === null ? {} : { piece: activePieceId.value }),
      },
    }),
  );
}

/** Place a read-only cut dimension, updating the existing one on the same span. */
function onAddCutDimension(placement: CutDimensionPlacement): void {
  // The canvas only starts a placement for a piece that exists in this document.
  const piece = pattern.value.pieces.find((candidate) => candidate.id === placement.piece)!;

  const [a, b] = canonicalCutAnchors(piece, placement.a, placement.b);
  const orientation = usesCutEdgeAnchor({ a, b }) ? 'aligned' : placement.orientation;
  const existing = findDerivedDimension(pattern.value, placement.piece, a, b);
  if (existing !== undefined) {
    run(() =>
      dispatch({
        id: nextCommandId('cut-dimension'),
        type: 'update_constraint',
        params: { id: existing.id, orientation, offset: placement.offset },
      }),
    );
    return;
  }

  run(() =>
    dispatch({
      id: nextCommandId('cut-dimension'),
      type: 'add_derived_dimension',
      params: {
        piece: placement.piece,
        a,
        b,
        orientation,
        offset: placement.offset,
      },
    }),
  );
}

function onUpdateDimension(id: EntityId, patch: DimensionPatch): void {
  run(() =>
    dispatch({
      id: nextCommandId('dimension'),
      type: 'update_constraint',
      params: { id, ...patch },
    }),
  );
}

function convert(id: string, construction: boolean): void {
  run(() =>
    dispatch({
      id: nextCommandId('construction'),
      type: 'set_construction',
      params: { id, construction },
    }),
  );
}

/** Rename, re-quantify or clear fields on a piece. */
function onUpdatePiece(
  id: EntityId,
  patch: {
    name?: string | null;
    quantity?: number | null;
    notes?: string | null;
    fabric?: string | null;
    color?: string | null;
  },
): void {
  run(() =>
    dispatch({
      id: nextCommandId('piece'),
      type: 'update_piece',
      params: { id, ...patch },
    }),
  );
}

/** Set or remove one edge's allowance; `null` removes the strip. */
function onSetPieceAllowance(
  piece: EntityId,
  edge: EntityId,
  value: { kind: AllowanceKind; width: number } | null,
): void {
  run(() =>
    dispatch({
      id: nextCommandId('allowance'),
      type: 'set_piece_allowance',
      params:
        value === null
          ? { piece, edge, remove: true }
          : { piece, edge, width: value.width, kind: value.kind },
    }),
  );
}

/** Set or remove one rounded corner's own cut width. */
function onSetPieceCornerAllowance(
  piece: EntityId,
  round: EntityId,
  value: { cutWidth: number } | null,
): void {
  if (value === null) {
    run(() =>
      dispatch({
        id: nextCommandId('corner-allowance'),
        type: 'set_piece_corner_allowance',
        params: { piece, round, remove: true },
      }),
    );
    return;
  }

  run(() =>
    dispatch({
      id: nextCommandId('corner-allowance'),
      type: 'set_piece_corner_allowance',
      params: { piece, round, cutWidth: value.cutWidth },
    }),
  );
}

/** One command per selected region, dispatched as one undo step. */
function onApplyAllowances(edit: BulkAllowanceEdit): void {
  const piece = activePiece.value;
  /* v8 ignore next -- the card emits only for the active piece */
  if (piece === null) return;

  const commands = allowanceEditCommands(
    pattern.value,
    piece,
    selectedAllowanceTargets.value,
    edit,
    nextCommandId,
  );
  if (commands.length === 0) return;
  run(() => dispatchGroup(commands));
}

/** Set, clear or inherit a piece's allowance default. */
function onSetPieceDefault(
  piece: EntityId,
  value:
    | { mode: 'inherit' }
    | { mode: 'none' }
    | { mode: 'preset'; width: ParamInput; kind: AllowanceKind },
): void {
  run(() =>
    dispatch({
      id: nextCommandId('piece-default'),
      type: 'set_piece_default_allowance',
      params: { piece, ...value },
    }),
  );
}

/** The deletion warning for a placed piece: how often and where it is placed. */
function placedPieceWarning(piece: Piece): string | null {
  const placements = pattern.value.assemblies.flatMap((assembly) =>
    assembly.instances.filter((instance) => instance.piece === piece.id),
  );
  if (placements.length === 0) return null;
  const assemblies = pattern.value.assemblies.filter((assembly) =>
    assembly.instances.some((instance) => instance.piece === piece.id),
  ).length;
  const name = piece.name?.trim() || `Piece ${piece.id}`;
  return `${name} is placed ${placements.length} time${
    placements.length === 1 ? '' : 's'
  } in ${assemblies} assembl${assemblies === 1 ? 'y' : 'ies'}. Remove it and its instances?`;
}

function onRemovePiece(id: EntityId): void {
  const piece = pieceById(pattern.value, id);
  /* v8 ignore next -- the card renders only for an existing piece */
  const warning = piece === undefined ? null : placedPieceWarning(piece);
  if (warning !== null && !window.confirm(warning)) return;
  if (run(() => dispatch({ id: nextCommandId('piece'), type: 'delete_piece', params: { id } }))) {
    selectedEntityIds.value = [];
    selectedInstanceId.value = null;
  }
}

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
      <EditorRibbon
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
        @select-tool="selectTool"
        @select-constraint="selectConstraint"
        @action="onRibbonAction"
        @toggle-sidebar="toggleCollapsed"
      />

      <ConstraintPromptBar
        v-if="activeConstraint"
        :type="activeConstraint"
        :prompt="constraintPromptText"
        :rejection="constraintRejectionMessage"
        :value-ready="constraintValueReady"
        :initial-value="constraintInitial"
        :document="pattern"
        @apply="applyConstraintValue"
        @cancel="exitConstraint"
      />

      <CornerRoundPromptBar
        v-if="cornerRoundActive"
        :prompt="cornerRoundPromptText"
        :rejection="cornerRoundRejectionMessage"
        :ready="cornerRoundReady"
        :initial-value="cornerRoundInitial"
        :max-radius="cornerRoundMax ?? 0"
        :document="pattern"
        @apply="applyCornerRound"
        @cancel="exitCornerRound"
        @preview="cornerRoundPreviewRadius = $event"
      />

      <MeasuredEditBar
        v-if="editingMeasured"
        :name="editingMeasured.name"
        :sources="measuredSourceChips(editingMeasured.sources)"
        :message="measuredEditMessage"
        @remove="onMeasuredEdgeToggle"
        @done="endMeasuredEdit"
        @cancel="cancelMeasuredEdit"
      />

      <p v-if="error" class="border-b px-3 py-1 text-sm text-destructive">{{ error }}</p>

      <p class="sr-only" aria-live="polite" data-testid="selection-status">
        {{ selectionStatus }}
      </p>

      <SketchToolbar
        v-if="isSketch"
        :pieces="pattern.pieces"
        :target="editor.sketchTarget"
        :arrange="sketchArrange"
        :read-only="editor.readOnly"
        @update:target="onSketchTarget"
        @update:arrange="sketchArrange = $event"
        @fit="fit"
      />

      <div class="flex min-h-0 flex-1">
        <div class="relative min-h-0 flex-1 p-2">
          <p
            v-if="pattern.tabs.length === 0"
            class="flex h-full items-center justify-center text-sm text-muted-foreground"
            data-testid="no-tabs-empty"
          >
            Create a piece to start
          </p>
          <AssemblyCanvas
            v-else-if="isAssemblyTab && activeAssembly"
            :document="assemblyDocument"
            :assembly-id="activeAssembly.id"
            :pieces="pattern.pieces"
            :selected-instance-id="selectedInstanceId"
            :picker-open="assemblyPickerOpen"
            :fit-token="fitToken"
            :read-only="editor.readOnly"
            :show-cut-shapes="display.assembly.cutShapes"
            :show-allowances="display.assembly.allowances"
            :show-stitch="display.assembly.stitch"
            :show-folds="display.assembly.folds"
            :show-notches="display.assembly.notches"
            :show-labels="display.assembly.labels"
            @select="selectInstance"
            @move="onMoveInstance"
            @nudge="onNudgeInstance"
            @remove="onRemoveInstance"
            @add-piece="onAddInstance"
            @close-picker="assemblyPickerOpen = false"
          />
          <PatternCanvas
            v-else
            :selected-entity-ids="selectedEntityIds"
            v-model:selected-dimension-ids="selectedDimensionIds"
            v-model:selected-allowance-targets="selectedAllowanceTargets"
            :document="visibleDocument"
            :tool="activeTool"
            :fit-token="fitToken"
            :show-allowances="display.piece.allowances"
            :show-constraints="display.piece.constraints"
            :show-dimensions="display.piece.dimensions"
            :constraint-active="activeConstraint !== null"
            :constraint-picks="constraintPicks"
            :round-corner-active="cornerRoundActive"
            :round-corner-picks="cornerRoundPicks"
            :corner-round-preview-radius="cornerRoundPreviewRadius"
            :read-only="editor.readOnly"
            :active-piece-id="activePieceId"
            :move-mode="isSketch && sketchArrange"
            :measure-active="editingMeasured !== null"
            @measure-pick="onMeasuredEdgeToggle"
            :highlighted-entity-ids="measuredHighlightIds"
            @update:selected-entity-ids="onSelectEntities"
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
          />
          <div v-if="pattern.tabs.length > 0" class="absolute bottom-3 right-3 z-20">
            <CanvasDisplayMenu
              :items="displayItems"
              :values="displayValues"
              @toggle="toggleDisplay"
            />
          </div>
        </div>

        <EditorSidebar
          :width="width"
          :collapsed="collapsed"
          :counts="panelCounts"
          :pattern-id="props.id"
          :mode="isAssemblyTab ? 'assembly' : 'piece'"
          :read-only="editor.readOnly"
          @update:width="setWidth"
          @update:collapsed="collapsed = $event"
        >
          <template #properties>
            <SelectionSummary
              v-if="selectedDimensionIds.length > 0 || selectedEntityIds.length > 1"
              :entities="selectedEntities"
              :dimensions="selectedDimensionIds.length"
              :delete-disabled="orphanCandidates.length > 0"
              :delete-hint="orphanHint"
              :measure-label="measureLabel"
              :measure-disabled="measuredSelection.chain === null"
              :measure-hint="measuredSelection.problem"
              @delete="deleteSelected"
              @measure="onMeasureSelection"
            />

            <EntityPropertiesPanel
              v-else-if="selectedEntity"
              :document="pattern"
              :entity="selectedEntity"
              @set-construction="convert"
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
            />

            <SidebarEmpty
              v-else
              icon="select"
              message="Nothing selected"
              hint="Select a point, line, curve, arc, circle or dimension on the canvas or in a drawer."
              data-testid="properties-empty"
            />
          </template>

          <template #stats>
            <SidebarStat data-testid="workspace-summary">
              <span data-testid="active-tool">{{ activeToolLabel }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ journal.length }} command(s)</span>
              <span aria-hidden="true">·</span>
              <span>{{ cutEdgeCount }} cut edge(s)</span>
            </SidebarStat>
          </template>

          <template #pieces>
            <PiecePanel
              v-if="activePiece && activePieceSummary"
              :summary="activePieceSummary"
              :piece="activePiece"
              :document="pattern"
              :selected-targets="selectedAllowanceTargets"
              :default-allowance="defaultAllowance"
              :inherited-default="defaultAllowance"
              :label="activePiece.name ?? 'Piece'"
              prefix="piece-drawer"
              :marks="activePieceMarks"
              @update-piece="onUpdatePiece"
              @set-piece-default="onSetPieceDefault"
              @set-piece-allowance="onSetPieceAllowance"
              @set-all-allowances="onSetAllAllowances"
              @set-piece-corner-allowance="onSetPieceCornerAllowance"
              @apply-allowances="onApplyAllowances"
              @remove-piece="onRemovePiece"
              @set-cut-loop="setCutLoop"
              @clear-cut-loop="clearCutLoop"
              @delete-mark="onDeleteMark"
              @set-notch-depth="onSetNotchDepth"
            />
            <SidebarEmpty
              v-else
              icon="piece"
              message="No piece tab is active"
              hint="Use the + menu to create a piece."
              data-testid="pieces-empty"
            />
          </template>

          <template #assembly>
            <AssemblyPanel
              :document="pattern"
              :assembly="activeAssembly!"
              :selected-instance-id="selectedInstanceId"
              :read-only="editor.readOnly"
              @update-assembly="onUpdateAssembly"
              @update-instance="onUpdateInstance"
              @update-piece="onUpdatePiece"
              @set-default="onSetPieceDefault"
              @open-piece="openPieceTab"
              @remove-instance="onRemoveInstance"
            />
          </template>

          <template #outline>
            <OutlinePanel
              :edges="edges"
              :selected-ids="selectedIds"
              @select="onOutlineSelect"
              @convert="convert"
            />
          </template>

          <template #dimensions>
            <DimensionsPanel
              :document="pattern"
              :selected-ids="selectedDimensionIdSet"
              @select="onDimensionSelect"
              @update="onUpdateDimension"
              @remove="removeConstraint"
            />
          </template>

          <template #variables>
            <VariablesPanel
              :document="pattern"
              :read-only="editor.readOnly"
              @create="onAddVariable"
              @rename="onRenameVariable"
              @set-value="onSetVariableValue"
              @set-unit="onSetVariableUnit"
              @set-comment="onSetVariableComment"
              @remove="onRemoveVariable"
              :can-measure="measuredSelection.chain !== null"
              :active-slug="highlightedVariableSlug"
              :editing-slug="editingMeasuredSlug"
              :compact="width < 420"
              @create-measured="onMeasureSelection"
              @highlight="onHighlightVariable"
              @edit-measured="startMeasuredEdit"
            />
          </template>

          <template #constraints>
            <ConstraintsPanel :constraints="otherConstraints" @remove="removeConstraint" />
          </template>
        </EditorSidebar>
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

      <ExportDialog
        v-if="exportOpen && activePiece"
        :piece-label="activePieceLabel"
        :settings="display.export"
        @update:settings="updateExportSettings"
        @download="downloadSvg"
        @cancel="exportOpen = false"
      />

      <SaveConflictDialog
        v-if="conflict"
        :saved-at="conflict.savedAt"
        @reload="reloadFromConflict"
        @overwrite="overwrite"
      />

      <ProjectSettingsDialog
        v-if="settingsOpen && project"
        :project="project"
        :allowance="defaultAllowance"
        :read-only="editor.readOnly"
        :saving="settingsSaving"
        :error="settingsError"
        @save="onSaveSettings"
        @cancel="settingsOpen = false"
      />

      <UpgradeDocumentDialog
        v-if="pendingUpgrade"
        :saved-schema="pendingUpgrade.schema"
        :editor-schema="PATTERN_SCHEMA"
        @readonly="openReadOnlyDocument"
        @cancel="cancelUpgrade"
      />
    </template>
  </section>
</template>
