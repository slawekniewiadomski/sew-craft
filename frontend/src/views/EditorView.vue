<script setup lang="ts">
import {
  circleGeometry,
  constraintEntityIds,
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
  pieceById,
  pieceCutLoop,
  seamForEdge,
  toSvgPiece,
  usesCutEdgeAnchor,
} from '@sewcraft/geometry';
import type {
  AddConstraintParams,
  AllowanceKind,
  Assembly,
  Command,
  ConstraintType,
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
import { onBeforeRouteLeave, RouterLink, useRouter } from 'vue-router';

import { ApiError, projectsApi, type Pattern } from '@/api/projects';
import AssemblyCanvas from '@/components/AssemblyCanvas.vue';
import AssemblyPanel from '@/components/AssemblyPanel.vue';
import CanvasDisplayMenu from '@/components/CanvasDisplayMenu.vue';
import ConstraintPromptBar from '@/components/ConstraintPromptBar.vue';
import CornerRoundPromptBar from '@/components/CornerRoundPromptBar.vue';
import DimensionReferencePicker from '@/components/DimensionReferencePicker.vue';
import EditorRibbon from '@/components/EditorRibbon.vue';
import EditorSidebar from '@/components/EditorSidebar.vue';
import EditorTabs from '@/components/EditorTabs.vue';
import EditorTopBar from '@/components/EditorTopBar.vue';
import EntityPropertiesPanel from '@/components/EntityPropertiesPanel.vue';
import ExportDialog from '@/components/ExportDialog.vue';
import PatternCanvas from '@/components/PatternCanvas.vue';
import PiecePanel from '@/components/PiecePanel.vue';
import RibbonIcon from '@/components/RibbonIcon.vue';
import SaveConflictDialog from '@/components/SaveConflictDialog.vue';
import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import SidebarHeading from '@/components/sidebar/SidebarHeading.vue';
import SidebarStat from '@/components/sidebar/SidebarStat.vue';
import SelectionSummary from '@/components/SelectionSummary.vue';
import UpgradeDocumentDialog from '@/components/UpgradeDocumentDialog.vue';
import { Button } from '@/components/ui/button';
import { useCommandBus } from '@/composables/use-command-bus';
import { useSidebarLayout } from '@/composables/use-sidebar-layout';
import { defaultAllowanceSummary } from '@/lib/allowance-defaults';
import { parseAllowanceWidth } from '@/lib/allowance-width';
import { buildCircleCommands, type CircleEndpoint } from '@/lib/circle-tool';
import { nextCommandId } from '@/lib/command-ids';
import {
  applyConstraintPick,
  constraintInitialValue,
  constraintPrompt,
  constraintRejection,
  constraintValueSpec,
  prunePicks,
  type ConstraintPick,
} from '@/lib/constraint-tools';
import { constraintLabel } from '@/lib/constraint-view';
import {
  applyCornerRoundPick,
  cornerRoundPrompt,
  cornerRoundRejection,
  defaultCornerRadius,
  emptyCornerRoundPicks,
  formatCornerRadius,
  maxCornerRadiusForLines,
  type CornerRoundPicks,
} from '@/lib/corner-round';
import {
  DIMENSION_ORIENTATION_OPTIONS,
  anchorLabel,
  dimensionPatchForEdit,
  dimensionStateLabel,
  dimensionTone,
  filterReferenceOptions,
  formatDimensionField,
  formatDimensionValue,
  isReferenceEditText,
  parseDimensionEdit,
  parseDimensionValue,
  referenceOptions,
  referenceSearchText,
  type DimensionPatch,
  type DimensionPlacement,
  type DimensionReferenceOption,
  type CutDimensionPlacement,
} from '@/lib/dimensions';
import { buildArcCommands, type ArcEndpoint } from '@/lib/arc-tool';
import { createAutosave, fitsKeepaliveBudget, type SaveOrigin } from '@/lib/autosave';
import { downloadSvgFile } from '@/lib/download';
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
import { buildPointOnLineCommands } from '@/lib/point-on-line';
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
  pieceSizeLine,
  pieceSummaries,
  pieceTitleLine,
} from '@/lib/pieces';
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';
import { applySelection, orphanedEdges, selectionModeFrom, toggleSelection } from '@/lib/selection';
import {
  assemblyTab,
  nextPieceColor,
  pieceTab,
  readPersistedTab,
  tabLabel,
  writePersistedTab,
} from '@/lib/tabs';
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
const router = useRouter();

/**
 * The one background writer. It owns timing only: every write still goes
 * through `persist`, so autosave and the Save button share one code path.
 */
const autosave = createAutosave({
  write: (origin) => persist(editor.savedVersion, { origin }),
  shouldWrite: canAutosave,
});
const { width, collapsed, setWidth } = useSidebarLayout(window.localStorage);

const error = ref<string | null>(null);
const activeTool = ref<EditorTool>('select');
/** Ordered, ephemeral selection: never written to the document or journal. */
const selectedEntityIds = ref<EntityId[]>([]);
/**
 * Ordered, ephemeral dimension selection. Dimensions are constraints, not
 * entities, so they keep a separate selection. A click or drawer row keeps the
 * two kinds exclusive; only a committed marquee may fill both.
 */
const selectedDimensionIds = ref<EntityId[]>([]);
/** The active tab, mirrored from the store; switching it is view state only. */
const activeTab = computed(() => editor.activeTab);
const isAssemblyTab = computed(() => activeTab.value?.kind === 'assembly');
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
/** Whether the Add piece picker overlay is open. */
const assemblyPickerOpen = ref(false);

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

const activeConstraint = ref<ConstraintType | null>(null);
const constraintPicks = ref<ConstraintPick[]>([]);
const pendingConstraint = ref<AddConstraintParams | null>(null);
const constraintRejectionMessage = ref<string | null>(null);
const cornerRoundPicks = ref<CornerRoundPicks>(emptyCornerRoundPicks());
const cornerRoundRejectionMessage = ref<string | null>(null);
const cornerRoundPreviewRadius = ref<number | null>(null);

/**
 * Construction geometry is presentation only: hiding it filters what is drawn
 * without touching the document, so the toggle never changes the model.
 */
/**
 * The piece canvas only ever sees the active piece: the cross-piece edit path
 * is gone rather than refused, so every hit is editable.
 */
const pieceDocument = computed(() => {
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
    .filter((entity) => entity.kind !== 'point' && entity.kind !== 'text')
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

/**
 * Distance constraints are the driving dimensions; the sidebar edits their
 * value and measurement axis, while the canvas renders them. Derived cut
 * dimensions share the list but keep their value read-only. Every other
 * constraint stays in the generic constraints list.
 */
interface DimensionRow {
  id: EntityId;
  constraint: DistanceConstraint | DerivedDistanceConstraint;
  kind: 'distance' | 'derived';
  readOnly: boolean;
  entities: string[];
  value: string;
  field: string;
  state: DimensionState;
  stateLabel: string;
  sourceId: EntityId | null;
  orientation: DimensionOrientation;
  /** Edge- or line-anchored dimensions are always aligned; the axis control is hidden. */
  orientationLocked: boolean;
  offset: string;
}

const dimensions = computed<DimensionRow[]>(() =>
  pattern.value.constraints.flatMap<DimensionRow>((constraint): DimensionRow[] => {
    if (constraint.type === 'derived_distance') {
      const measured = derivedDimensionValue(pattern.value, constraint);
      const state = derivedDimensionState(pattern.value, constraint);
      return [
        {
          id: constraint.id,
          constraint,
          kind: 'derived',
          readOnly: true,
          entities: [
            `${constraint.a.edge}:${constraint.a.at}`,
            `${constraint.b.edge}:${constraint.b.at}`,
          ],
          value: measured === null ? '—' : formatDimensionValue(measured),
          field: measured === null ? '' : formatDimensionValue(measured),
          state,
          stateLabel: dimensionStateLabel(state),
          sourceId: null,
          orientation: constraintOrientation(constraint),
          orientationLocked: usesCutEdgeAnchor(constraint),
          offset: formatDimensionValue(constraintOffset(constraint)),
        },
      ];
    }

    if (constraint.type !== 'distance') return [];
    // Point deletion cascades to constraints, so a surviving dimension resolves.
    const measured = dimensionValue(pattern.value, constraint);
    const state = dimensionState(pattern.value, constraint);
    return [
      {
        id: constraint.id,
        constraint,
        kind: 'distance',
        readOnly: false,
        entities: [
          anchorLabel(pattern.value, constraint.a),
          anchorLabel(pattern.value, constraint.b),
        ],
        value: formatDimensionValue(measured ?? 0),
        field: formatDimensionField(constraint, measured, state),
        state,
        stateLabel: dimensionStateLabel(state),
        sourceId: constraint.reference ?? null,
        orientation: constraintOrientation(constraint),
        orientationLocked:
          isLineAnchor(pattern.value, constraint.a) || isLineAnchor(pattern.value, constraint.b),
        offset: formatDimensionValue(constraintOffset(constraint)),
      },
    ];
  }),
);

/** The `#` picker open in the Dimensions drawer, if any. */
const dimensionPicker = ref<{ id: EntityId; text: string; activeIndex: number } | null>(null);

/** Filtered rows for the open drawer picker. */
const dimensionPickerOptions = computed<DimensionReferenceOption[]>(() => {
  const picker = dimensionPicker.value!;
  const constraint = pattern.value.constraints.find(
    (entry): entry is DistanceConstraint => entry.id === picker.id && entry.type === 'distance',
  )!;
  return filterReferenceOptions(referenceOptions(pattern.value, constraint), picker.text);
});

/** The row Enter would pick in the drawer, or `null` for an empty list. */
const activeDimensionPickerOption = computed<DimensionReferenceOption | null>(() => {
  const picker = dimensionPicker.value;
  if (picker === null || dimensionPickerOptions.value.length === 0) return null;
  return dimensionPickerOptions.value[
    Math.min(picker.activeIndex, dimensionPickerOptions.value.length - 1)
  ]!;
});

/** The drawer picker's highlighted row, clamped to its filtered list. */
const activeDimensionPickerIndex = computed<number>(() =>
  activeDimensionPickerOption.value === null
    ? -1
    : dimensionPickerOptions.value.findIndex(
        (option) => option.id === activeDimensionPickerOption.value!.id,
      ),
);

function pickerOptionsFor(id: EntityId): DimensionReferenceOption[] {
  const constraint = pattern.value.constraints.find(
    (entry): entry is DistanceConstraint => entry.id === id && entry.type === 'distance',
  )!;
  return referenceOptions(pattern.value, constraint);
}

function openDimensionPicker(id: EntityId, text = ''): void {
  dimensionPicker.value = { id, text, activeIndex: 0 };
}

function closeDimensionPicker(): void {
  dimensionPicker.value = null;
}

function moveDimensionPicker(step: number): void {
  const picker = dimensionPicker.value!;
  const count = dimensionPickerOptions.value.length;
  if (count === 0) return;
  dimensionPicker.value = {
    text: picker.text,
    activeIndex: (picker.activeIndex + step + count) % count,
    id: picker.id,
  };
}

function onDimensionInput(id: EntityId, event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  if (isReferenceEditText(value)) {
    openDimensionPicker(id, referenceSearchText(value));
  } else if (dimensionPicker.value?.id === id) {
    closeDimensionPicker();
  }
}

function selectDimensionReference(id: EntityId, reference: EntityId): void {
  closeDimensionPicker();
  onUpdateDimension(id, { reference });
}

function onDimensionKeydown(id: EntityId, event: KeyboardEvent): void {
  const picker = dimensionPicker.value;
  if (picker === null || picker.id !== id) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveDimensionPicker(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveDimensionPicker(-1);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDimensionPicker();
    return;
  }
  if (event.key === 'Enter' && activeDimensionPickerOption.value !== null) {
    event.preventDefault();
    selectDimensionReference(id, activeDimensionPickerOption.value.id);
  }
}

const otherConstraints = computed(() =>
  pattern.value.constraints.filter(
    (constraint) => constraint.type !== 'distance' && constraint.type !== 'derived_distance',
  ),
);

const activeToolLabel = computed(
  () => EDITOR_TOOLS.find((tool) => tool.id === activeTool.value)!.label,
);

const constraintPromptText = computed(() =>
  constraintPrompt(activeConstraint.value!, constraintPicks.value),
);
const constraintValueReady = computed(
  () => activeConstraint.value !== null && pendingConstraint.value !== null,
);
const constraintInitial = computed(() =>
  activeConstraint.value === null || pendingConstraint.value === null
    ? ''
    : constraintInitialValue(activeConstraint.value, constraintPicks.value, pattern.value),
);

const cornerRoundActive = computed(() => activeTool.value === 'round_corner');
const cornerRoundMax = computed(() => {
  const { first, second } = cornerRoundPicks.value;
  if (first === null || second === null) return null;
  return maxCornerRadiusForLines(pattern.value, first, second);
});
const cornerRoundReady = computed(
  () => cornerRoundMax.value !== null && cornerRoundMax.value >= 0.001,
);
const cornerRoundPromptText = computed(() => cornerRoundPrompt(cornerRoundPicks.value));
const cornerRoundInitial = computed(() =>
  cornerRoundMax.value === null
    ? ''
    : formatCornerRadius(defaultCornerRadius(cornerRoundMax.value)),
);

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
  exitConstraint();
  exitCornerRound();
  activeTool.value = activeTool.value === tool ? 'select' : tool;
}

function exitConstraint(): void {
  activeConstraint.value = null;
  constraintPicks.value = [];
  pendingConstraint.value = null;
  constraintRejectionMessage.value = null;
}

function exitCornerRound(): void {
  cornerRoundPicks.value = emptyCornerRoundPicks();
  cornerRoundRejectionMessage.value = null;
  cornerRoundPreviewRadius.value = null;
}

function selectConstraint(type: ConstraintType): void {
  if (activeConstraint.value === type) {
    exitConstraint();
    return;
  }

  exitCornerRound();
  activeConstraint.value = type;
  activeTool.value = 'select';
  selectedEntityIds.value = [];
  constraintPicks.value = [];
  pendingConstraint.value = null;
  constraintRejectionMessage.value = null;
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

function onReorderTabs(tabs: TabRef[]): void {
  run(() => dispatch({ id: nextCommandId('tabs'), type: 'reorder_tabs', params: { tabs } }));
}

function selectInstance(id: EntityId | null): void {
  selectedInstanceId.value = id;
  selectedEntityIds.value = [];
  selectedDimensionIds.value = [];
}

function onMoveInstance(id: EntityId, x: number, y: number): void {
  const assembly = activeAssembly.value;
  /* v8 ignore next -- the canvas exists only inside an assembly tab */
  if (assembly === null) return;
  run(() =>
    dispatch({
      id: nextCommandId('instance'),
      type: 'update_instance',
      params: { assembly: assembly.id, instance: id, x, y },
    }),
  );
}

/** Arrow nudges coalesce into one journal entry like point nudges do. */
const instanceNudge = ref<{ id: EntityId | null; dx: number; dy: number }>({
  id: null,
  dx: 0,
  dy: 0,
});
let instanceNudgeTimer: ReturnType<typeof setTimeout> | null = null;

function onNudgeInstance(id: EntityId, dx: number, dy: number): void {
  if (instanceNudge.value.id === null) {
    const instance = activeAssembly.value?.instances.find((entry) => entry.id === id);
    /* v8 ignore next -- the canvas only nudges instances it rendered */
    if (instance === undefined) return;
    instanceNudge.value = { id, dx: 0, dy: 0 };
  }
  instanceNudge.value = {
    id,
    dx: instanceNudge.value.dx + dx,
    dy: instanceNudge.value.dy + dy,
  };
  if (instanceNudgeTimer !== null) clearTimeout(instanceNudgeTimer);
  instanceNudgeTimer = setTimeout(() => {
    const pending = instanceNudge.value;
    instanceNudge.value = { id: null, dx: 0, dy: 0 };
    instanceNudgeTimer = null;
    const assembly = activeAssembly.value;
    /* v8 ignore start -- the assembly exists while its canvas is mounted */
    const instance =
      assembly === null ? undefined : assembly.instances.find((entry) => entry.id === pending.id);
    if (assembly === null || instance === undefined) return;
    /* v8 ignore stop */
    /* v8 ignore next -- the canvas never emits a zero nudge */
    if (pending.dx === 0 && pending.dy === 0) return;
    run(() =>
      dispatch({
        id: nextCommandId('instance'),
        type: 'update_instance',
        params: {
          assembly: assembly.id,
          instance: instance.id,
          x: instance.x + pending.dx,
          y: instance.y + pending.dy,
        },
      }),
    );
  }, 300);
}

function onRemoveInstance(id: EntityId): void {
  const assembly = activeAssembly.value;
  /* v8 ignore next -- the canvas exists only inside an assembly tab */
  if (assembly === null) return;
  if (
    run(() =>
      dispatch({
        id: nextCommandId('instance'),
        type: 'remove_instance',
        params: { assembly: assembly.id, instance: id },
      }),
    )
  ) {
    selectedInstanceId.value = null;
  }
}

function onAddInstance(piece: EntityId): void {
  const assembly = activeAssembly.value;
  /* v8 ignore next -- the picker exists only inside an assembly tab */
  if (assembly === null) return;
  run(() =>
    dispatch({
      id: nextCommandId('instance'),
      type: 'add_instance',
      params: { assembly: assembly.id, piece, x: 0, y: 0 },
    }),
  );
  assemblyPickerOpen.value = false;
}

/** Mirror or rotate the selected instance through one update_instance. */
function onTransformInstance(kind: 'mirror' | 'rotate'): void {
  const assembly = activeAssembly.value;
  /* v8 ignore start -- the ribbon action exists only inside an assembly tab */
  const instance =
    assembly === null
      ? undefined
      : assembly.instances.find((entry) => entry.id === selectedInstanceId.value);
  if (assembly === null || instance === undefined) return;
  /* v8 ignore stop */
  const patch =
    kind === 'mirror'
      ? { mirrored: instance.mirrored !== true }
      : { rotation: (instance.rotation ?? 0) + Math.PI / 2 };
  run(() =>
    dispatch({
      id: nextCommandId('instance'),
      type: 'update_instance',
      params: { assembly: assembly.id, instance: instance.id, ...patch },
    }),
  );
}

function onUpdateInstance(patch: {
  x?: number;
  y?: number;
  rotation?: number;
  mirrored?: boolean;
}): void {
  const assembly = activeAssembly.value;
  /* v8 ignore next -- the panel renders only with a selected instance */
  if (assembly === null || selectedInstanceId.value === null) return;
  run(() =>
    dispatch({
      id: nextCommandId('instance'),
      type: 'update_instance',
      params: { assembly: assembly.id, instance: selectedInstanceId.value!, ...patch },
    }),
  );
}

function onUpdateAssembly(name: string): void {
  const assembly = activeAssembly.value;
  /* v8 ignore next -- the panel exists only inside an assembly tab */
  if (assembly === null) return;
  run(() =>
    dispatch({
      id: nextCommandId('assembly'),
      type: 'update_assembly',
      params: { id: assembly.id, name },
    }),
  );
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

/** Change the default kind; None clears the default. */
function onDefaultAllowanceKind(event: Event): void {
  const kind = (event.target as HTMLSelectElement).value as AllowanceKind | 'none';
  if (kind === 'none') {
    run(() =>
      dispatch({
        id: nextCommandId('default-allowance'),
        type: 'set_default_allowance',
        params: { remove: true },
      }),
    );
    return;
  }

  /* v8 ignore next -- a non-none default always has a positive width */
  const width = defaultAllowance.value.width > 0 ? defaultAllowance.value.width : 10;
  run(() =>
    dispatch({
      id: nextCommandId('default-allowance'),
      type: 'set_default_allowance',
      params: { width, kind },
    }),
  );
}

/** An invalid or unchanged default width snaps back without a command. */
function onDefaultAllowanceWidth(event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseAllowanceWidth(input.value);
  const current = defaultAllowance.value;
  const currentKind = current.kind;
  if (width === null || currentKind === 'none') {
    input.value = String(current.width);
    return;
  }
  if (width === current.width) return;

  run(() =>
    dispatch({
      id: nextCommandId('default-allowance'),
      type: 'set_default_allowance',
      params: { width, kind: currentKind },
    }),
  );
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
function onOutlineSelect(id: EntityId, event: MouseEvent): void {
  const mode = selectionModeFrom(event);
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
function onDimensionSelect(id: EntityId, event: MouseEvent | KeyboardEvent): void {
  const mode = selectionModeFrom(event);
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
  const commands = buildPointOnLineCommands(
    pattern.value,
    lineId,
    { x, y },
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

function onDimensionValueEdit(id: EntityId, event: Event): void {
  const input = event.target as HTMLInputElement;
  const dimension = dimensions.value.find((entry) => entry.id === id)!;
  if (dimension.readOnly) {
    input.value = dimension.field;
    return;
  }

  const edit = parseDimensionEdit(input.value);
  if (edit.kind === 'invalid') {
    input.value = dimension.field;
    return;
  }

  const unchangedSet =
    edit.kind === 'set' &&
    dimension.constraint.type === 'distance' &&
    dimension.state === 'set' &&
    dimension.constraint.value === edit.value;
  const unchangedDriven = edit.kind === 'driven' && dimension.state === 'driven';
  if (unchangedSet || unchangedDriven) {
    input.value = dimension.field;
    return;
  }

  const patch = dimensionPatchForEdit(edit, pickerOptionsFor(id));
  if (patch === null) {
    input.value = dimension.field;
    return;
  }

  closeDimensionPicker();
  onUpdateDimension(id, patch);
}

function onDimensionOrientationEdit(id: EntityId, event: Event): void {
  const orientation = (event.target as HTMLSelectElement).value as DimensionOrientation;
  onUpdateDimension(id, { orientation });
}

function onDimensionOffsetEdit(id: EntityId, event: Event): void {
  const offset = parseDimensionValue((event.target as HTMLInputElement).value);
  if (offset === null) return;
  onUpdateDimension(id, { offset });
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

/** Set, clear or inherit a piece's allowance default. */
function onSetPieceDefault(
  piece: EntityId,
  value:
    { mode: 'inherit' } | { mode: 'none' } | { mode: 'preset'; width: number; kind: AllowanceKind },
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

function dispatchConstraint(params: AddConstraintParams): boolean {
  return run(() =>
    dispatch({
      id: nextCommandId('constraint'),
      type: 'add_constraint',
      params: {
        ...params,
        /* v8 ignore next -- the canvas only exists inside a piece tab */
        ...(activePieceId.value === null ? {} : { piece: activePieceId.value }),
      },
    }),
  );
}

function onConstraintPick(pick: ConstraintPick): void {
  const type = activeConstraint.value!;
  if (pendingConstraint.value !== null) return;

  const result = applyConstraintPick({ type, picks: constraintPicks.value }, pick, pattern.value);
  if (result.status === 'rejected') {
    constraintRejectionMessage.value = constraintRejection(result.reason);
    return;
  }

  constraintRejectionMessage.value = null;
  constraintPicks.value = result.picks;

  if (result.status === 'picking') return;

  if (constraintValueSpec(type) !== null) {
    pendingConstraint.value = result.params;
    return;
  }

  if (dispatchConstraint(result.params)) {
    constraintPicks.value = [];
  }
}

function applyConstraintValue(value: number): void {
  const params = pendingConstraint.value!;

  if (dispatchConstraint({ ...params, value })) {
    pendingConstraint.value = null;
    constraintPicks.value = [];
    constraintRejectionMessage.value = null;
  }
}

function removeConstraint(id: EntityId): void {
  run(() =>
    dispatch({ id: nextCommandId('constraint'), type: 'remove_constraint', params: { id } }),
  );
}

/** One line pick: fill a slot or reject the pair with a concrete reason. */
function onRoundCornerPick(id: EntityId): void {
  const result = applyCornerRoundPick(cornerRoundPicks.value, id, pattern.value);
  if (result.status === 'rejected') {
    cornerRoundRejectionMessage.value = cornerRoundRejection(result.reason);
    return;
  }

  cornerRoundRejectionMessage.value = null;
  cornerRoundPicks.value = result.picks;
  if (result.status === 'picking') cornerRoundPreviewRadius.value = null;
}

/** Apply keeps the tool armed for the next corner, like the other tools. */
function applyCornerRound(radius: number): void {
  const { first, second } = cornerRoundPicks.value;
  if (first === null || second === null) return;

  const applied = run(() =>
    dispatch({
      id: nextCommandId('corner-round'),
      type: 'add_corner_round',
      params: { first, second, radius },
    }),
  );
  if (applied) exitCornerRound();
}

function setCornerRoundRadius(id: EntityId, radius: number): void {
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

function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]')
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

  if (event.key === 'Escape' && activeTool.value !== 'select') {
    event.preventDefault();
    exitCornerRound();
    activeTool.value = 'select';
    return;
  }

  if (isEditing(event.target)) return;

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

  if (activeConstraint.value === null) return;

  const pruned = prunePicks(constraintPicks.value, next);
  if (pruned.length === constraintPicks.value.length) return;

  constraintPicks.value = pruned;
  pendingConstraint.value = null;
  constraintRejectionMessage.value = null;
});

// A picked line can disappear through delete or undo while the tool is armed.
watch(pattern, (next) => {
  const picks = cornerRoundPicks.value;
  if (picks.first === null && picks.second === null) return;

  const exists = (id: EntityId | null): boolean =>
    id === null || next.entities.some((entity) => entity.id === id);
  if (exists(picks.first) && exists(picks.second)) return;

  exitCornerRound();
});

type LoadState = 'loading' | 'ready' | 'error';
type SaveBarState = 'new' | 'dirty' | 'saving' | 'saved' | 'failed' | 'paused' | 'error';
type SaveOutcome = 'saved' | 'retry' | 'stop';

interface SaveOptions {
  origin?: SaveOrigin;
  /** Keep the request alive when the page is hidden or unloading. */
  keepalive?: boolean;
}

interface PendingUpgrade {
  /** The document exactly as stored; a failed upgrade keeps this read-only. */
  stored: PatternDocument;
  /** The document to open: normalised for an older known schema. */
  document: PatternDocument;
  schema: string;
  version: number;
  savedAt: string | null;
  unknown: boolean;
}

const loadState = ref<LoadState>('loading');
const loadError = ref<string | null>(null);
const patternName = ref('');
const pendingUpgrade = ref<PendingUpgrade | null>(null);
/** Set when a save lost the version race; `savedAt` is the winner's checkpoint. */
const conflict = ref<{ savedAt: string | null } | null>(null);
/** Either modal owns the keyboard and blocks the editor shortcuts. */
const dialogOpen = computed(() => pendingUpgrade.value !== null || conflict.value !== null);

/** The one status the save bar shows: paused > saving > error > dirty/failed > saved. */
const saveBarState = computed<SaveBarState>(() => {
  if (editor.saveState === 'paused') return 'paused';
  if (editor.saveState === 'saving') return 'saving';
  if (editor.saveState === 'error') return 'error';
  if (editor.isDirty) return editor.saveState === 'failed' ? 'failed' : 'dirty';
  return editor.isNew ? 'new' : 'saved';
});

/** Whether a background write is meaningful right now. */
function canAutosave(): boolean {
  if (loadState.value !== 'ready') return false;
  if (editor.readOnly) return false;
  if (dialogOpen.value) return false;
  if (editor.saveState === 'paused') return false;
  // A manual save (or a lifecycle flush) already writes this document.
  if (editor.saveState === 'saving') return false;
  return editor.isDirty;
}

/** Whether a stored document has the arrays every render path dereferences. */
function isRenderableDocument(stored: PatternDocument): boolean {
  return (
    Array.isArray(stored.entities) &&
    Array.isArray(stored.constraints) &&
    Array.isArray(stored.pieces)
  );
}

function unreadableMessage(name: string): string {
  return `The stored pattern for "${name}" is unreadable.`;
}

/** Load the stored pattern; a new project opens empty, a missing one errors. */
async function loadPattern(): Promise<void> {
  autosave.cancel();
  loadState.value = 'loading';
  loadError.value = null;
  // Drop any previous project's document so a shortcut or save can never send
  // it to this project before the load resolves.
  editor.markNew();

  try {
    const response = await projectsApi.getPattern(Number(props.id));
    applySnapshot(response.data);
    loadState.value = 'ready';
  } catch (cause) {
    loadError.value = cause instanceof Error ? cause.message : 'Failed to load the project';
    loadState.value = 'error';
  }
}

/**
 * Adopt a stored pattern. This build reads schema 0.3 only; anything else is
 * rendered read-only and never migrated, copied or rewritten.
 */
function applySnapshot(snapshot: Pattern): void {
  patternName.value = snapshot.name;
  const stored = snapshot.document;

  if (stored === null) {
    editor.markNew();
    return;
  }

  if (stored.schema === PATTERN_SCHEMA) {
    if (!isRenderableDocument(stored)) throw new Error(unreadableMessage(snapshot.name));
    editor.markLoaded(
      stored,
      snapshot.version,
      snapshot.saved_at,
      readPersistedTab(window.localStorage, props.id),
    );
    return;
  }

  if (!isRenderableDocument(stored)) throw new Error(unreadableMessage(snapshot.name));
  editor.markReadOnlyLoaded(stored, snapshot.version, snapshot.saved_at);
  pendingUpgrade.value = {
    stored,
    document: stored,
    schema: stored.schema,
    version: snapshot.version,
    savedAt: snapshot.saved_at,
    unknown: true,
  };
}

/**
 * Write the current document. Returns what the writer should do next: an
 * explicit save that tripped a conflict opens the dialog instead and leaves the
 * work untouched, while an autosave pauses quietly and waits for a manual Save.
 */
async function persist(
  expectedVersion: number | null,
  { origin = 'manual', keepalive = false }: SaveOptions = {},
): Promise<SaveOutcome> {
  const snapshot = pattern.value;
  editor.markSaving();

  try {
    const payload = {
      document: snapshot,
      expected_version: expectedVersion,
      ...(origin === 'autosave' ? { origin } : {}),
    };

    const response = keepalive
      ? await projectsApi.savePattern(Number(props.id), payload, { keepalive: true })
      : await projectsApi.savePattern(Number(props.id), payload);
    editor.markSaved(snapshot, response.data.version, response.data.saved_at, origin);
    error.value = null;
    return 'saved';
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) {
      const body = cause.body as { saved_at?: string | null } | null;

      // Never open a modal while the maker is typing: an autosave conflict only
      // pauses the bar, and the explicit Save reuses the existing dialog.
      if (origin === 'autosave') {
        editor.markSavePaused();
        return 'stop';
      }

      conflict.value = { savedAt: body?.saved_at ?? null };
      editor.markSaveFailed();
      return 'stop';
    }

    if (cause instanceof ApiError && cause.status === 404) {
      editor.markSaveFailed();
      loadError.value = 'This project no longer exists.';
      loadState.value = 'error';
      return 'stop';
    }

    // A 4xx other than a conflict or a missing project is permanent: retrying
    // the same document would fail the same way, so a new change is required.
    if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
      editor.markSaveError();
      error.value = cause.message;
      return 'stop';
    }

    editor.markSaveFailed();
    error.value = cause instanceof Error ? cause.message : 'Save failed';
    return 'retry';
  }
}

/** Save through the button and Cmd/Ctrl+S; clean, saving or read-only is a no-op. */
function save(): void {
  if (loadState.value !== 'ready') return;
  if (editor.readOnly || editor.saveState === 'saving') return;
  if (!editor.isDirty && !editor.isNew) return;

  // A retryable failure arms the background ladder inside the scheduler.
  void autosave.flush();
}

function reloadFromConflict(): void {
  conflict.value = null;
  autosave.cancel();
  void loadPattern();
}

/** Explicit overwrite: no expected version, so the save appends a checkpoint. */
function overwrite(): void {
  conflict.value = null;
  autosave.cancel();
  void persist(null).then((outcome) => {
    if (outcome === 'retry') autosave.retry();
  });
}

function openReadOnlyDocument(): void {
  const pending = pendingUpgrade.value;
  if (pending === null) return;

  editor.markReadOnlyLoaded(pending.stored, pending.version, pending.savedAt);
  editor.setReadOnly(true);
  pendingUpgrade.value = null;
}

function cancelUpgrade(): void {
  pendingUpgrade.value = null;
  void router.push({ name: 'projects' });
}

/** The browser's own prompt; there is no silent discard on a reload or close. */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!editor.isDirty) return;
  event.preventDefault();
  event.returnValue = '';
}

onBeforeRouteLeave(() => {
  if (!editor.isDirty) return true;
  return window.confirm('You have unsaved changes. Leave without saving?');
});

/**
 * Best-effort write while the tab is hidden or the page is unloading. The
 * browser drops oversized keepalive requests, so an over-budget payload is
 * skipped and the unload guard remains the backstop.
 */
function flushBeforeUnload(): void {
  if (!canAutosave()) return;

  const payload = {
    document: pattern.value,
    expected_version: editor.savedVersion,
    origin: 'autosave' as const,
  };

  if (!fitsKeepaliveBudget(JSON.stringify(payload))) return;

  autosave.cancel();
  // The response still updates the bar when the tab merely lost focus; during a
  // real unload there is nothing left to update, which is harmless.
  void persist(editor.savedVersion, { origin: 'autosave', keepalive: true });
}

function onVisibilityChange(): void {
  if (document.hidden) {
    flushBeforeUnload();
    return;
  }

  // A hidden tab cancelled the pending timers; re-arm when the maker returns.
  if (editor.isDirty) autosave.schedule();
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', flushBeforeUnload);
  void loadPattern();
});

onBeforeUnmount(() => {
  if (instanceNudgeTimer !== null) clearTimeout(instanceNudgeTimer);
  autosave.cancel();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('beforeunload', onBeforeUnload);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', flushBeforeUnload);
});
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <EditorTopBar
      :name="patternName"
      :state="saveBarState"
      :saved-at="editor.lastSavedAt"
      :origin="editor.lastSaveOrigin"
      :read-only="editor.readOnly"
      :load-state="loadState"
      @save="save"
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
        @select-tool="selectTool"
        @select-constraint="selectConstraint"
        @action="onRibbonAction"
      />

      <ConstraintPromptBar
        v-if="activeConstraint"
        :type="activeConstraint"
        :prompt="constraintPromptText"
        :rejection="constraintRejectionMessage"
        :value-ready="constraintValueReady"
        :initial-value="constraintInitial"
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
        @apply="applyCornerRound"
        @cancel="exitCornerRound"
        @preview="cornerRoundPreviewRadius = $event"
      />

      <p v-if="error" class="border-b px-3 py-1 text-sm text-destructive">{{ error }}</p>

      <p class="sr-only" aria-live="polite" data-testid="selection-status">
        {{ selectionStatus }}
      </p>

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
            v-model:selected-entity-ids="selectedEntityIds"
            v-model:selected-dimension-ids="selectedDimensionIds"
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
            @move-point="onMovePoint"
            @add-text="onAddText"
            @add-point="onAddPoint"
            @add-point-on-line="onAddPointOnLine"
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
              @delete="deleteSelected"
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
            <div class="space-y-2">
              <template v-if="activePiece && activePieceSummary">
                <PiecePanel
                  :summary="activePieceSummary"
                  :piece="activePiece"
                  :default-allowance="defaultAllowance"
                  :inherited-default="defaultAllowance"
                  label="Piece"
                  prefix="piece-drawer"
                  active
                  @update-piece="onUpdatePiece"
                  @set-piece-default="onSetPieceDefault"
                  @set-piece-allowance="onSetPieceAllowance"
                  @set-all-allowances="onSetAllAllowances"
                  @remove-piece="onRemovePiece"
                  @set-cut-loop="setCutLoop"
                  @clear-cut-loop="clearCutLoop"
                  @activate="setActiveTab(pieceTab($event))"
                />
              </template>
              <SidebarEmpty
                v-else
                icon="piece"
                message="No piece tab is active"
                hint="Use the + menu to create a piece."
                data-testid="pieces-empty"
              />
            </div>
          </template>

          <template #pattern>
            <div class="space-y-1 rounded-md border p-2" data-testid="default-allowance">
              <SidebarHeading label="Document default" />
              <div class="flex flex-wrap items-center gap-1.5">
                <select
                  class="h-7 rounded-sm border px-1.5 text-2xs"
                  :value="defaultAllowance.kind"
                  :disabled="editor.readOnly"
                  aria-label="Default allowance kind"
                  data-testid="default-allowance-kind"
                  @change="onDefaultAllowanceKind"
                >
                  <option value="none" data-testid="default-allowance-none">None</option>
                  <option value="seam">Seam</option>
                  <option value="single">Single fold</option>
                  <option value="double">Double fold</option>
                </select>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  class="h-7 w-16 rounded-sm border px-1.5 text-2xs tabular-nums"
                  :value="defaultAllowance.kind === 'none' ? '' : defaultAllowance.width"
                  :disabled="defaultAllowance.kind === 'none' || editor.readOnly"
                  aria-label="Default allowance width"
                  data-testid="default-allowance-width"
                  @change="onDefaultAllowanceWidth"
                />
                <span class="text-2xs text-muted-foreground">mm</span>
              </div>
              <p class="text-2xs leading-snug text-muted-foreground">
                Applied to new pieces that inherit it.
              </p>
            </div>
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
            <ul v-if="edges.length > 0" class="space-y-1" aria-label="Edges">
              <li
                v-for="edge in edges"
                :key="edge.id"
                class="flex items-center gap-1 border-l-2 border-transparent pl-1"
                :class="selectedIds.has(edge.id) ? 'rounded-r-sm border-primary bg-primary/10' : ''"
                :data-testid="`outline-row-${edge.id}`"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-1 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  :aria-label="`Select entity ${edge.id}`"
                  :aria-current="selectedIds.has(edge.id) ? 'true' : undefined"
                  :data-testid="`outline-select-${edge.id}`"
                  @click="onOutlineSelect(edge.id, $event)"
                >
                  <RibbonIcon
                    :icon="ribbonIcon(EDGE_KIND_ICONS[edge.kind])"
                    :size="12"
                    class="shrink-0 text-muted-foreground"
                  />
                  <span class="shrink-0 text-[13px] font-medium">
                    {{ EDGE_KIND_LABELS[edge.kind] }}
                  </span>
                  <span class="truncate font-mono text-2xs text-muted-foreground">
                    {{ edge.label }}
                  </span>

                  <Pill
                    v-if="edge.seamWidth !== null"
                    tone="accent"
                    class="ml-auto"
                    :data-testid="`seam-label-${edge.id}`"
                  >
                    Allowance {{ edge.seamWidth }} mm
                  </Pill>
                  <span
                    v-else-if="edge.pieceId !== null"
                    class="ml-auto flex items-center gap-1"
                    :data-testid="`edge-piece-${edge.id}`"
                  >
                    <span class="text-2xs text-muted-foreground">In piece {{ edge.pieceId }}</span>
                    <Pill v-if="edge.allowanceKind !== null" tone="accent">
                      {{ edge.allowanceKind }} {{ edge.allowanceWidth }} mm
                    </Pill>
                  </span>
                  <Pill
                    v-else
                    tone="neutral"
                    class="ml-auto border-dashed"
                    :data-testid="`seam-empty-${edge.id}`"
                  >
                    No allowance
                  </Pill>
                </button>

                <SidebarAction
                  icon="line"
                  :label="edge.construction ? 'Make cut edge' : 'Make construction'"
                  :data-testid="`outline-construction-${edge.id}`"
                  @click="convert(edge.id, !edge.construction)"
                />
              </li>
            </ul>
            <SidebarEmpty v-else message="No edges yet." />
          </template>

          <template #dimensions>
            <ul v-if="dimensions.length > 0" class="space-y-2" aria-label="Dimensions">
              <li
                v-for="dimension in dimensions"
                :key="dimension.id"
                class="space-y-1.5 rounded-sm border-t px-1 pt-2 first:border-t-0 first:pt-0"
                :class="selectedDimensionIdSet.has(dimension.id) ? 'bg-primary/10' : ''"
                :data-testid="`dimension-${dimension.id}`"
              >
                <div class="flex items-center justify-between gap-2">
                  <div
                    role="button"
                    tabindex="0"
                    class="min-w-0 flex flex-wrap items-baseline gap-1 rounded-sm text-left"
                    :aria-current="selectedDimensionIdSet.has(dimension.id) ? 'true' : undefined"
                    :data-testid="`select-dimension-${dimension.id}`"
                    @click="onDimensionSelect(dimension.id, $event)"
                    @keydown.enter.prevent="onDimensionSelect(dimension.id, $event)"
                    @keydown.space.prevent="onDimensionSelect(dimension.id, $event)"
                  >
                    <span class="font-mono text-2xs text-muted-foreground">{{ dimension.id }}</span>
                    <span class="text-2xs text-muted-foreground">
                      ({{ dimension.entities.join(', ') }})
                    </span>
                  </div>
                  <SidebarAction
                    icon="delete"
                    :label="`Remove dimension ${dimension.id}`"
                    :data-testid="`remove-dimension-${dimension.id}`"
                    @click="removeConstraint(dimension.id)"
                  />
                </div>

                <div class="relative flex flex-wrap items-center gap-1.5">
                  <input
                    type="text"
                    inputmode="decimal"
                    class="h-7 w-24 rounded-sm border px-2 text-[13px] font-medium tabular-nums"
                    :class="dimension.readOnly ? 'bg-muted' : ''"
                    :value="dimension.field"
                    :readonly="dimension.readOnly"
                    :aria-label="`Value for ${dimension.id} (${dimension.stateLabel.toLowerCase()})`"
                    :data-testid="`dimension-value-${dimension.id}`"
                    role="combobox"
                    aria-autocomplete="list"
                    :aria-expanded="dimensionPicker?.id === dimension.id"
                    :aria-controls="
                      dimensionPicker?.id === dimension.id
                        ? `dimension-drawer-reference-list-${dimension.id}`
                        : undefined
                    "
                    :aria-activedescendant="
                      dimensionPicker?.id === dimension.id && activeDimensionPickerOption !== null
                        ? `dimension-drawer-reference-list-${dimension.id}-${activeDimensionPickerOption.id}`
                        : undefined
                    "
                    @input="onDimensionInput(dimension.id, $event)"
                    @keydown="onDimensionKeydown(dimension.id, $event)"
                    @change="onDimensionValueEdit(dimension.id, $event)"
                  />
                  <span class="text-2xs text-muted-foreground">mm</span>
                  <Pill
                    :tone="dimensionTone(dimension.state)"
                    :data-dimension-state="dimension.state"
                    :data-testid="`dimension-state-${dimension.id}`"
                  >
                    {{ dimension.stateLabel }}
                  </Pill>
                  <Button
                    v-if="!dimension.readOnly"
                    variant="outline"
                    size="sm"
                    :data-testid="`dimension-reference-${dimension.id}`"
                    @click="openDimensionPicker(dimension.id)"
                  >
                    {{ dimension.state === 'broken' ? 'Re-link' : 'Reference' }}
                  </Button>

                  <DimensionReferencePicker
                    v-if="dimensionPicker?.id === dimension.id"
                    :list-id="`dimension-drawer-reference-list-${dimension.id}`"
                    class="top-full left-0 mt-1"
                    :options="dimensionPickerOptions"
                    :active-index="activeDimensionPickerIndex"
                    @select="selectDimensionReference(dimension.id, $event)"
                  />
                </div>

                <div class="flex flex-wrap items-center gap-1.5">
                  <span
                    v-if="dimension.orientationLocked"
                    class="h-7 rounded-sm border px-1.5 text-2xs leading-7"
                    :data-testid="`dimension-orientation-locked-${dimension.id}`"
                  >
                    Aligned
                  </span>
                  <select
                    v-else
                    class="h-7 rounded-sm border px-1.5 text-2xs"
                    :value="dimension.orientation"
                    :aria-label="`Orientation for ${dimension.id}`"
                    :data-testid="`dimension-orientation-${dimension.id}`"
                    @change="onDimensionOrientationEdit(dimension.id, $event)"
                  >
                    <option
                      v-for="option in DIMENSION_ORIENTATION_OPTIONS"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <input
                    type="number"
                    step="1"
                    class="h-7 w-24 rounded-sm border px-2 text-[13px] tabular-nums"
                    :value="dimension.offset"
                    :aria-label="`Offset for ${dimension.id}`"
                    :data-testid="`dimension-offset-${dimension.id}`"
                    @change="onDimensionOffsetEdit(dimension.id, $event)"
                  />
                  <span class="text-2xs text-muted-foreground">offset (mm)</span>
                </div>

                <p
                  v-if="dimension.readOnly"
                  class="text-2xs leading-snug text-muted-foreground"
                  :data-testid="`dimension-readonly-${dimension.id}`"
                >
                  Cut dimension — read-only; it follows the stitch dimension and the allowance
                  widths.
                </p>
                <p
                  v-else-if="dimension.state === 'referenced'"
                  class="text-2xs leading-snug text-muted-foreground"
                  :data-testid="`dimension-source-${dimension.id}`"
                >
                  Source: <span class="font-mono">{{ dimension.sourceId }}</span>
                </p>
                <p
                  v-else-if="dimension.state === 'broken'"
                  class="text-2xs leading-snug text-destructive"
                  :data-testid="`dimension-broken-${dimension.id}`"
                >
                  Source {{ dimension.sourceId }} is missing. Type a value or press # to re-link.
                </p>

                <div v-if="dimension.sourceId !== null" class="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    :data-testid="`dimension-unlink-${dimension.id}`"
                    @click="onUpdateDimension(dimension.id, { reference: null })"
                  >
                    Remove reference
                  </Button>
                </div>
              </li>
            </ul>
            <SidebarEmpty v-else message="No dimensions yet." />
          </template>

          <template #constraints>
            <ul v-if="otherConstraints.length > 0" class="space-y-2" aria-label="Constraints">
              <li
                v-for="constraint in otherConstraints"
                :key="constraint.id"
                class="flex items-center justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0"
              >
                <div class="min-w-0">
                  <span class="text-[13px] font-medium">{{ constraintLabel(constraint) }}</span>
                  <span class="ml-1.5 font-mono text-2xs text-muted-foreground">
                    {{ constraint.id }}
                  </span>
                  <span class="ml-1.5 text-2xs text-muted-foreground">
                    ({{ constraintEntityIds(constraint).join(', ') }})
                  </span>
                </div>
                <SidebarAction
                  icon="delete"
                  :label="`Remove constraint ${constraint.id}`"
                  :data-testid="`remove-constraint-${constraint.id}`"
                  @click="removeConstraint(constraint.id)"
                />
              </li>
            </ul>
            <SidebarEmpty v-else message="No constraints yet." />
          </template>
        </EditorSidebar>
      </div>

      <EditorTabs
        :document="pattern"
        :model-value="activeTab"
        :read-only="editor.readOnly"
        @update:model-value="setActiveTab"
        @new-piece="newPiece"
        @new-assembly="newAssembly"
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
