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
  isDrivenDimension,
  isKnownPatternSchema,
  measureLinearDimension,
  normalizeDocument,
  ALLOWANCE_KIND_LABELS,
  PATTERN_SCHEMA,
  seamForEdge,
  toSvg,
  usesCutEdgeAnchor,
} from '@sewcraft/geometry';
import type {
  AddConstraintParams,
  AllowanceKind,
  Command,
  ConstraintType,
  DerivedDistanceConstraint,
  DimensionOrientation,
  DimensionState,
  DistanceConstraint,
  EntityId,
  PatternDocument,
} from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, RouterLink, useRouter } from 'vue-router';

import { ApiError, projectsApi, type Pattern } from '@/api/projects';
import ConstraintPromptBar from '@/components/ConstraintPromptBar.vue';
import CornerRoundPromptBar from '@/components/CornerRoundPromptBar.vue';
import DimensionReferencePicker from '@/components/DimensionReferencePicker.vue';
import EditorRibbon from '@/components/EditorRibbon.vue';
import EditorSaveBar from '@/components/EditorSaveBar.vue';
import EditorSidebar from '@/components/EditorSidebar.vue';
import EntityPropertiesPanel from '@/components/EntityPropertiesPanel.vue';
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
import { downloadSvgFile } from '@/lib/download';
import type { DraftingEndpoint } from '@/lib/drafting';
import type { RibbonAction } from '@/lib/editor-ribbon';
import type { DrawerId } from '@/lib/editor-drawers';
import { EDITOR_TOOLS, type EditorTool } from '@/lib/editor-tools';
import { entityProperties } from '@/lib/entity-properties';
import { buildLineCommands, type LineEndpoint } from '@/lib/line-tool';
import { buildRectangleCommands, type RectangleMode } from '@/lib/rectangle-tool';
import {
  edgeLabel,
  canonicalCutAnchors,
  findDerivedDimension,
  pieceCreationFromSelection,
  pieceLabel,
  pieceSizeLine,
  pieceSummaries,
  pieceTitleLine,
} from '@/lib/pieces';
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';
import { applySelection, orphanedEdges, selectionModeFrom, toggleSelection } from '@/lib/selection';
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
const { width, collapsed, setWidth } = useSidebarLayout(window.localStorage);

const error = ref<string | null>(null);
const activeTool = ref<EditorTool>('select');
/** Ordered, ephemeral selection: never written to the document or journal. */
const selectedEntityIds = ref<EntityId[]>([]);
/**
 * The piece whose card is open in the Pieces drawer. Ephemeral like the entity
 * selection, and deliberately separate from it: deleting a row never targets a
 * loop by accident.
 */
const selectedPieceId = ref<EntityId | null>(null);
/** True while a marquee owns the pointer, so Delete/Escape defer to the canvas. */
const marqueeActive = ref(false);
const fitToken = ref(0);
const showConstruction = ref(true);
const includeConstruction = ref(false);
const showAllowances = ref(true);
const showConstraints = ref(true);
const showDimensions = ref(true);
const exportStitch = ref(true);
const exportFold = ref(true);
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
const visibleDocument = computed(() =>
  showConstruction.value
    ? pattern.value
    : {
        ...pattern.value,
        entities: pattern.value.entities.filter((entity) => !entity.construction),
      },
);

/** Every line, curve, arc and circle, so any edge can be converted between guide and cut. */
const edges = computed(() =>
  pattern.value.entities
    .filter((entity) => entity.kind !== 'point')
    .map((entity) => {
      const seam = seamForEdge(pattern.value, entity.id);
      const piece = pattern.value.pieces.find((candidate) => candidate.edges.includes(entity.id));
      const allowance = piece?.allowances.find((candidate) => candidate.edge === entity.id);
      return {
        id: entity.id,
        kind: entity.kind,
        label: edgeLabel(pattern.value, entity.id),
        construction: entity.construction,
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

/** The ordered loop the selection would become, or the reason it cannot. */
const pieceCreation = computed(() =>
  pieceCreationFromSelection(pattern.value, selectedEntityIds.value),
);

const defaultAllowance = computed(() => defaultAllowanceSummary(pattern.value));
const defaultAllowanceHint = computed(() => {
  const choice = defaultAllowance.value;
  return choice.kind === 'none'
    ? 'New pieces start with no allowance.'
    : `New pieces get ${choice.width} mm ${ALLOWANCE_KIND_LABELS[choice.kind].toLowerCase()}.`;
});
const canCreatePiece = computed(() => pieceCreation.value.ok);

/** The entity selection as a set, for row highlighting and `aria-current`. */
const selectedIds = computed(() => new Set(selectedEntityIds.value));

/** Every piece, in document order, as the Pieces drawer lists them. */
const pieces = computed(() => pieceSummaries(pattern.value));

/** Per-drawer row counts for the header badges; the View drawer has none. */
const drawerCounts = computed<Partial<Record<DrawerId, number>>>(() => ({
  properties: selectedEntityIds.value.length,
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

/**
 * Open or collapse one piece's card. Selecting a piece clears the entity
 * selection so Delete and the inspector never act on the wrong target.
 */
function selectPiece(id: EntityId): void {
  selectedPieceId.value = selectedPieceId.value === id ? null : id;
  if (selectedPieceId.value !== null) selectedEntityIds.value = [];
}

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
const selectionStatus = computed(() =>
  selectedEntityIds.value.length === 1
    ? '1 entity selected'
    : `${selectedEntityIds.value.length} entities selected`,
);

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
        entities: [constraint.a, constraint.b],
        value: formatDimensionValue(measured ?? 0),
        field: formatDimensionField(constraint, measured, state),
        state,
        stateLabel: dimensionStateLabel(state),
        sourceId: constraint.reference ?? null,
        orientation: constraintOrientation(constraint),
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

function downloadSvg(): void {
  downloadSvgFile(
    `pattern-${props.id}.svg`,
    toSvg(pattern.value, {
      construction: includeConstruction.value,
      stitch: exportStitch.value,
      fold: exportFold.value,
    }),
  );
}

/** Create one piece from the selected closed chain, or explain the first break. */
function createPiece(): void {
  const result = pieceCreation.value;
  if (!result.ok) {
    error.value = result.message;
    return;
  }

  if (
    run(() =>
      dispatch({
        id: nextCommandId('piece'),
        type: 'create_piece',
        params: { edges: result.edges, allowance: 'default' },
      }),
    )
  ) {
    selectedEntityIds.value = [];
  }
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

watch(selectedEntityIds, (ids) => {
  if (ids.length > 0) selectedPieceId.value = null;
});

/**
 * Select one Outline row's entity with the canvas' modifier rules: plain click
 * replaces, Ctrl/Cmd toggles, Ctrl/Cmd+Shift (or Alt) subtracts.
 */
function onOutlineSelect(id: EntityId, event: MouseEvent): void {
  const mode = selectionModeFrom(event);
  if (mode === 'replace') {
    selectedEntityIds.value = [id];
    return;
  }
  selectedEntityIds.value =
    mode === 'add'
      ? toggleSelection(selectedEntityIds.value, id)
      : applySelection(selectedEntityIds.value, [id], 'subtract');
}

function deleteSelected(): void {
  const ids = selectedEntityIds.value;
  if (ids.length === 0 || marqueeActive.value || editor.readOnly) return;

  const orphans = orphanCandidates.value;
  if (orphans.length > 0) {
    error.value = `Cannot delete this selection: ${orphans.join(', ')} would lose a point. Include the edge${
      orphans.length === 1 ? '' : 's'
    } in the selection first.`;
    return;
  }

  const commands: Command[] = ids.map((id) => ({
    id: nextCommandId('delete'),
    type: 'delete_entity',
    params: { id },
  }));
  if (run(() => dispatchGroup(commands))) selectedEntityIds.value = [];
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
    case 'create_piece':
      createPiece();
      break;
    case 'download_svg':
      downloadSvg();
      break;
  }
}

function onMovePoint(id: EntityId, x: number, y: number): void {
  run(() => dispatch({ id: nextCommandId('move'), type: 'move_point', params: { id, x, y } }));
}

function onAddPoint(x: number, y: number): void {
  run(() => dispatch({ id: nextCommandId('point'), type: 'add_point', params: { x, y } }));
}

/** One gesture: new endpoints become points, then the line, as a single entry. */
function onAddLine(start: LineEndpoint, end: LineEndpoint): void {
  run(() => dispatchGroup(buildLineCommands(start, end, nextCommandId)));
}

/** One gesture: new endpoints become points, then the arc, as a single entry. */
function onAddArc(start: ArcEndpoint, end: ArcEndpoint, through: ArcEndpoint): void {
  run(() => dispatchGroup(buildArcCommands(start, end, through, nextCommandId)));
}

/** One gesture: new endpoints become points, then the circle, as a single entry. */
function onAddCircle(center: CircleEndpoint, rim: CircleEndpoint): void {
  run(() => dispatchGroup(buildCircleCommands(center, rim, nextCommandId)));
}

/**
 * One gesture: new corners become points, then the four sides and their
 * constraints, as a single entry and a single undo.
 */
function onAddRectangle(mode: RectangleMode, clicks: DraftingEndpoint[]): void {
  run(() => dispatchGroup(buildRectangleCommands(pattern.value, mode, clicks, nextCommandId)));
}

function onAddCurve(points: [EntityId, EntityId, EntityId, EntityId]): void {
  run(() =>
    dispatch({
      id: nextCommandId('curve'),
      type: 'add_curve',
      params: { p0: points[0], p1: points[1], p2: points[2], p3: points[3] },
    }),
  );
}

/**
 * Place a dimension as a driven distance constraint: it measures the span and
 * adds no equation. Reusing an existing distance between the same two points
 * avoids duplicates and keeps that dimension's driven/set state; the placement
 * then only updates its presentation.
 */
function onAddDimension(placement: DimensionPlacement): void {
  const existing = findDistanceConstraint(pattern.value, placement.a, placement.b);
  if (existing !== undefined) {
    run(() =>
      dispatch({
        id: nextCommandId('dimension'),
        type: 'update_constraint',
        params: { id: existing.id, orientation: placement.orientation, offset: placement.offset },
      }),
    );
    return;
  }

  const measured = measureLinearDimension(
    pattern.value,
    placement.a,
    placement.b,
    placement.orientation,
  )!;
  if (measured <= 0) return;

  run(() =>
    dispatch({
      id: nextCommandId('dimension'),
      type: 'add_constraint',
      params: {
        type: 'distance',
        entities: [placement.a, placement.b],
        orientation: placement.orientation,
        offset: placement.offset,
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
  patch: { name?: string | null; quantity?: number | null },
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

function onRemovePiece(id: EntityId): void {
  if (run(() => dispatch({ id: nextCommandId('piece'), type: 'delete_piece', params: { id } }))) {
    selectedEntityIds.value = [];
  }
}

function dispatchConstraint(params: AddConstraintParams): boolean {
  return run(() => dispatch({ id: nextCommandId('constraint'), type: 'add_constraint', params }));
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

watch(pattern, (next) => {
  // Undo, redo or a load can remove a selected entity; keep only live ids.
  const surviving = selectedEntityIds.value.filter((id) => getEntity(next, id) !== undefined);
  if (surviving.length !== selectedEntityIds.value.length) {
    selectedEntityIds.value = surviving;
  }

  if (
    selectedPieceId.value !== null &&
    !next.pieces.some((piece) => piece.id === selectedPieceId.value)
  ) {
    selectedPieceId.value = null;
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
type SaveBarState = 'new' | 'dirty' | 'saving' | 'saved' | 'failed';

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

/** The one status the save bar shows, in priority order. */
const saveBarState = computed<SaveBarState>(() => {
  if (editor.saveState === 'saving') return 'saving';
  if (editor.isDirty) return editor.saveState === 'failed' ? 'failed' : 'dirty';
  return editor.isNew ? 'new' : 'saved';
});

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
 * Adopt a stored pattern. An older known schema is migrated only through the
 * upgrade modal; an unknown schema is rendered read-only and never normalised.
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
    editor.markLoaded(stored, snapshot.version, snapshot.saved_at);
    return;
  }

  if (isKnownPatternSchema(stored.schema)) {
    if (!Array.isArray(stored.entities) || !Array.isArray(stored.constraints)) {
      throw new Error(unreadableMessage(snapshot.name));
    }
    const migrated = normalizeDocument(stored);
    editor.markLoaded(migrated, snapshot.version, snapshot.saved_at);
    editor.setReadOnly(true);
    pendingUpgrade.value = {
      stored,
      document: migrated,
      schema: stored.schema,
      version: snapshot.version,
      savedAt: snapshot.saved_at,
      unknown: false,
    };
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
 * Write the current document. Returns whether a checkpoint landed; a conflict
 * opens the dialog instead and leaves the work untouched.
 */
async function persist(expectedVersion: number | null, expectedSchema?: string): Promise<boolean> {
  const snapshot = pattern.value;
  editor.markSaving();

  try {
    const response = await projectsApi.savePattern(Number(props.id), {
      document: snapshot,
      expected_version: expectedVersion,
      ...(expectedSchema === undefined ? {} : { expected_schema: expectedSchema }),
    });
    editor.markSaved(snapshot, response.data.version, response.data.saved_at);
    error.value = null;
    return true;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) {
      const body = cause.body as { saved_at?: string | null } | null;
      conflict.value = { savedAt: body?.saved_at ?? null };
      editor.markSaveFailed();
      return false;
    }

    if (cause instanceof ApiError && cause.status === 404) {
      editor.markSaveFailed();
      loadError.value = 'This project no longer exists.';
      loadState.value = 'error';
      return false;
    }

    editor.markSaveFailed();
    error.value = cause instanceof Error ? cause.message : 'Save failed';
    return false;
  }
}

/** Save through the button and Cmd/Ctrl+S; clean, saving or read-only is a no-op. */
function save(): void {
  if (loadState.value !== 'ready') return;
  if (editor.readOnly || editor.saveState === 'saving') return;
  if (!editor.isDirty && !editor.isNew) return;
  void persist(editor.savedVersion);
}

function reloadFromConflict(): void {
  conflict.value = null;
  void loadPattern();
}

/** Explicit overwrite: no expected version, so the save appends a checkpoint. */
function overwrite(): void {
  conflict.value = null;
  void persist(null);
}

async function updateDocument(): Promise<void> {
  const pending = pendingUpgrade.value;
  if (pending === null || editor.saveState === 'saving') return;

  if (!(await persist(pending.version, pending.schema))) {
    // A stale version during an upgrade must reload, not run the generic
    // overwrite path: that path would write the migrated document without
    // archiving the stored one.
    if (conflict.value !== null) {
      conflict.value = null;
      editor.markSaveFailed();
      error.value = 'The project changed elsewhere. Reload the project to upgrade it.';
      return;
    }

    editor.loadRaw(pending.stored);
    editor.setReadOnly(true);
  } else {
    editor.setReadOnly(false);
  }

  pendingUpgrade.value = null;
}

function openReadOnlyDocument(): void {
  const pending = pendingUpgrade.value;
  if (pending === null) return;

  if (pending.unknown) {
    editor.markReadOnlyLoaded(pending.stored, pending.version, pending.savedAt);
  } else {
    editor.markLoaded(pending.document, pending.version, pending.savedAt);
  }

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

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('beforeunload', onBeforeUnload);
  void loadPattern();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
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
      <EditorSaveBar
        :name="patternName"
        :state="saveBarState"
        :saved-at="editor.lastSavedAt"
        :read-only="editor.readOnly"
        @save="save"
      />

      <EditorRibbon
        :active-tool="activeTool"
        :active-constraint="activeConstraint"
        :can-undo="canUndo"
        :can-redo="canRedo"
        :can-delete="selectedEntityIds.length > 0"
        :can-create-piece="canCreatePiece"
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
        <div class="min-h-0 flex-1 p-2">
          <PatternCanvas
            v-model:selected-entity-ids="selectedEntityIds"
            :document="visibleDocument"
            :tool="activeTool"
            :fit-token="fitToken"
            :show-allowances="showAllowances"
            :selected-piece-id="selectedPieceId"
            :show-constraints="showConstraints"
            :show-dimensions="showDimensions"
            :constraint-active="activeConstraint !== null"
            :constraint-picks="constraintPicks"
            :round-corner-active="cornerRoundActive"
            :round-corner-picks="cornerRoundPicks"
            :corner-round-preview-radius="cornerRoundPreviewRadius"
            :read-only="editor.readOnly"
            @move-point="onMovePoint"
            @add-point="onAddPoint"
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
        </div>

        <EditorSidebar
          :width="width"
          :collapsed="collapsed"
          :counts="drawerCounts"
          :read-only="editor.readOnly"
          @update:width="setWidth"
          @update:collapsed="collapsed = $event"
        >
          <template #properties>
            <SelectionSummary
              v-if="selectedEntityIds.length > 1"
              :entities="selectedEntities"
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
              @set-piece-allowance="onSetPieceAllowance"
              @set-all-allowances="onSetAllAllowances"
              @remove-piece="onRemovePiece"
            />

            <SidebarEmpty
              v-else
              icon="select"
              message="Nothing selected"
              hint="Select a point, line, curve, arc or circle on the canvas."
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
              <div class="space-y-1 rounded-md border p-2" data-testid="default-allowance">
                <SidebarHeading label="Default allowance" />
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
                <p class="text-2xs leading-snug text-muted-foreground">Applied to new pieces.</p>
              </div>

              <ul v-if="pieces.length > 0" class="space-y-1" aria-label="Pieces">
                <li v-for="(piece, index) in pieces" :key="piece.id">
                  <button
                    type="button"
                    class="flex w-full items-start justify-between gap-2 rounded-sm px-1 py-1 text-left hover:bg-accent"
                    :class="selectedPieceId === piece.id ? 'bg-accent text-accent-foreground' : ''"
                    :aria-expanded="selectedPieceId === piece.id"
                    :aria-label="`${pieceLabel(piece, index)}: toggle piece details`"
                    :data-testid="`piece-row-${piece.id}`"
                    @click="selectPiece(piece.id)"
                  >
                    <span class="min-w-0 flex-1 space-y-0.5">
                      <span class="flex items-center gap-1.5">
                        <span class="truncate text-[13px] font-semibold">
                          {{ pieceTitleLine(piece, index) }}
                        </span>
                        <Pill tone="neutral">×{{ piece.quantity }}</Pill>
                      </span>
                      <span class="block text-2xs leading-snug text-muted-foreground">
                        {{ pieceSizeLine(piece.metrics) }}
                      </span>
                    </span>
                    <span aria-hidden="true" class="shrink-0 text-muted-foreground">
                      {{ selectedPieceId === piece.id ? '▾' : '▸' }}
                    </span>
                  </button>

                  <div v-if="selectedPieceId === piece.id" class="mt-1 px-1">
                    <PiecePanel
                      :summary="piece"
                      :default-allowance="defaultAllowance"
                      :label="pieceLabel(piece, index)"
                      prefix="piece-drawer"
                      @update-piece="onUpdatePiece"
                      @set-piece-allowance="onSetPieceAllowance"
                      @set-all-allowances="onSetAllAllowances"
                      @remove-piece="onRemovePiece"
                    />
                  </div>
                </li>
              </ul>

              <SidebarEmpty v-else message="No pieces yet." data-testid="pieces-empty" />

              <Button
                variant="outline"
                size="sm"
                :disabled="!canCreatePiece"
                :title="pieceCreation.ok ? undefined : pieceCreation.message"
                data-testid="pieces-create"
                @click="createPiece"
              >
                Create piece
              </Button>
              <p
                class="text-2xs leading-snug text-muted-foreground"
                data-testid="pieces-create-hint"
              >
                {{ defaultAllowanceHint }}
              </p>
            </div>
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
                class="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0"
                :data-testid="`dimension-${dimension.id}`"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0 flex flex-wrap items-baseline gap-1">
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
                  <select
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

          <template #view>
            <div class="space-y-3">
              <section aria-label="Display">
                <SidebarHeading label="Display" />
                <div class="space-y-1.5">
                  <label class="flex items-center gap-2 text-[13px]">
                    <input
                      v-model="showConstruction"
                      type="checkbox"
                      data-testid="show-construction"
                    />
                    Show construction
                  </label>
                  <label class="flex items-center gap-2 text-[13px]">
                    <input v-model="showAllowances" type="checkbox" data-testid="show-allowances" />
                    Show allowances
                  </label>
                  <label class="flex items-center gap-2 text-[13px]">
                    <input
                      v-model="showConstraints"
                      type="checkbox"
                      data-testid="show-constraints"
                    />
                    Show constraints
                  </label>
                  <label class="flex items-center gap-2 text-[13px]">
                    <input v-model="showDimensions" type="checkbox" data-testid="show-dimensions" />
                    Show dimensions
                  </label>
                </div>
              </section>

              <section aria-label="Export">
                <SidebarHeading label="Export" />
                <div class="space-y-1.5">
                  <label class="flex items-center gap-2 text-[13px]">
                    <input
                      v-model="includeConstruction"
                      type="checkbox"
                      data-testid="toggle-construction"
                    />
                    Include construction
                  </label>
                  <label class="flex items-center gap-2 text-[13px]">
                    <input v-model="exportStitch" type="checkbox" data-testid="toggle-stitch" />
                    Include stitch layer
                  </label>
                  <label class="flex items-center gap-2 text-[13px]">
                    <input v-model="exportFold" type="checkbox" data-testid="toggle-fold" />
                    Include fold lines
                  </label>
                </div>
              </section>
            </div>
          </template>
        </EditorSidebar>
      </div>

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
        :unknown="pendingUpgrade.unknown"
        @update="updateDocument"
        @readonly="openReadOnlyDocument"
        @cancel="cancelUpgrade"
      />
    </template>
  </section>
</template>
