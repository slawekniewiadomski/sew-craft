<script setup lang="ts">
import {
  circleGeometry,
  constraintEntityIds,
  constraintOffset,
  constraintOrientation,
  cutEdges,
  dimensionState,
  dimensionValue,
  findDistanceConstraint,
  getEntity,
  isDrivenDimension,
  measureLinearDimension,
  seamForEdge,
  seamSide,
  toSvg,
} from '@sewcraft/geometry';
import type {
  AddConstraintParams,
  Command,
  ConstraintType,
  CurveEntity,
  DimensionOrientation,
  DistanceConstraint,
  EntityId,
  LineEntity,
  SeamSide,
} from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import ConstraintPromptBar from '@/components/ConstraintPromptBar.vue';
import CornerRoundPromptBar from '@/components/CornerRoundPromptBar.vue';
import DimensionReferencePicker from '@/components/DimensionReferencePicker.vue';
import EditorRibbon from '@/components/EditorRibbon.vue';
import EditorSidebar from '@/components/EditorSidebar.vue';
import EntityPropertiesPanel from '@/components/EntityPropertiesPanel.vue';
import PatternCanvas from '@/components/PatternCanvas.vue';
import SelectionSummary from '@/components/SelectionSummary.vue';
import { Button } from '@/components/ui/button';
import { useCommandBus } from '@/composables/use-command-bus';
import { useSidebarLayout } from '@/composables/use-sidebar-layout';
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
} from '@/lib/dimensions';
import { downloadSvgFile } from '@/lib/download';
import type { RibbonAction } from '@/lib/editor-ribbon';
import { EDITOR_TOOLS, type EditorTool } from '@/lib/editor-tools';
import { entityProperties } from '@/lib/entity-properties';
import { buildLineCommands, type LineEndpoint } from '@/lib/line-tool';
import { parseSeamWidth } from '@/lib/seam-width';
import { orphanedEdges } from '@/lib/selection';

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
const { width, collapsed, setWidth } = useSidebarLayout(window.localStorage);

const error = ref<string | null>(null);
const activeTool = ref<EditorTool>('select');
/** Ordered, ephemeral selection: never written to the document or journal. */
const selectedEntityIds = ref<EntityId[]>([]);
/** True while a marquee owns the pointer, so Delete/Escape defer to the canvas. */
const marqueeActive = ref(false);
const fitToken = ref(0);
const showConstruction = ref(true);
const includeConstruction = ref(false);
const showSeamAllowance = ref(true);
const showConstraints = ref(true);
const showDimensions = ref(true);
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

/** Every line and curve, so any edge can be converted between guide and cut. */
const edges = computed(() =>
  pattern.value.entities
    .filter((entity): entity is LineEntity | CurveEntity => entity.kind !== 'point')
    .map((entity) => {
      const seam = seamForEdge(pattern.value, entity.id);
      return {
        id: entity.id,
        construction: entity.construction,
        seamId: seam?.id ?? null,
        seamWidth: seam?.width ?? null,
        seamSide: seam === undefined ? null : seamSide(seam),
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

const hasSelection = computed(() => selectedEntityIds.value.length > 0);

/** Live-region text, announced whenever the selection count changes. */
const selectionStatus = computed(() =>
  selectedEntityIds.value.length === 1
    ? '1 entity selected'
    : `${selectedEntityIds.value.length} entities selected`,
);

/**
 * Distance constraints are the driving dimensions; the sidebar edits their
 * value and measurement axis, while the canvas renders them. Every other
 * constraint stays in the generic constraints list.
 */
const dimensions = computed(() =>
  pattern.value.constraints.flatMap((constraint) => {
    if (constraint.type !== 'distance') return [];
    // Point deletion cascades to constraints, so a surviving dimension resolves.
    const measured = dimensionValue(pattern.value, constraint);
    const state = dimensionState(pattern.value, constraint);
    return [
      {
        id: constraint.id,
        constraint,
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
  pattern.value.constraints.filter((constraint) => constraint.type !== 'distance'),
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
    toSvg(pattern.value, { construction: includeConstruction.value }),
  );
}

function deleteSelected(): void {
  const ids = selectedEntityIds.value;
  if (ids.length === 0 || marqueeActive.value) return;

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

/** One gesture: new endpoints become points, then the circle, as a single entry. */
function onAddCircle(center: CircleEndpoint, rim: CircleEndpoint): void {
  run(() => dispatchGroup(buildCircleCommands(center, rim, nextCommandId)));
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

  const edit = parseDimensionEdit(input.value);
  if (edit.kind === 'invalid') {
    input.value = dimension.field;
    return;
  }

  const unchangedSet =
    edit.kind === 'set' && dimension.state === 'set' && dimension.constraint.value === edit.value;
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

function onAddAllowance(edge: EntityId): void {
  const entity = pattern.value.entities.find((candidate) => candidate.id === edge);
  if (seamForEdge(pattern.value, edge) !== undefined) return;

  if (entity === undefined || entity.kind === 'point' || entity.construction) {
    error.value = 'Only cut edges can carry a seam allowance';
    return;
  }

  run(() => dispatch({ id: nextCommandId('seam'), type: 'add_seam_allowance', params: { edge } }));
}

function setSeamWidth(id: EntityId, width: number): void {
  run(() =>
    dispatch({ id: nextCommandId('seam'), type: 'set_seam_allowance', params: { id, width } }),
  );
}

/** Flip a seam to the opposite side of its edge as one undoable command. */
function flipSeam(id: EntityId, side: SeamSide): void {
  run(() =>
    dispatch({
      id: nextCommandId('seam'),
      type: 'set_seam_allowance',
      params: { id, side: side === 'left' ? 'right' : 'left' },
    }),
  );
}

/** Sidebar width edit: invalid or unchanged values snap back without a command. */
function onSeamWidthEdit(id: EntityId, current: number, event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseSeamWidth(input.value);
  if (width === null || width === current) {
    input.value = String(current);
    return;
  }

  setSeamWidth(id, width);
}

function removeSeam(id: EntityId): void {
  run(() => dispatch({ id: nextCommandId('seam'), type: 'remove_seam_allowance', params: { id } }));
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

function seed(): void {
  const commands: Command[] = [
    { id: 'a', type: 'add_point', params: { x: 60, y: 260 } },
    { id: 'b', type: 'add_point', params: { x: 220, y: 260 } },
    { id: 'c', type: 'add_point', params: { x: 220, y: 170 } },
    { id: 'd', type: 'add_point', params: { x: 60, y: 170 } },
    { id: 'ab', type: 'add_line', params: { start: 'a', end: 'b' } },
    { id: 'bc', type: 'add_line', params: { start: 'b', end: 'c' } },
    { id: 'cd', type: 'add_line', params: { start: 'c', end: 'd' } },
    { id: 'da', type: 'add_line', params: { start: 'd', end: 'a' } },
    { id: 'bottom', type: 'add_constraint', params: { type: 'horizontal', entities: ['a', 'b'] } },
    { id: 'right', type: 'add_constraint', params: { type: 'vertical', entities: ['b', 'c'] } },
    { id: 'top', type: 'add_constraint', params: { type: 'horizontal', entities: ['c', 'd'] } },
    { id: 'left', type: 'add_constraint', params: { type: 'vertical', entities: ['d', 'a'] } },
    {
      id: 'width',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['a', 'b'], value: 160 },
    },
    {
      id: 'height',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['b', 'c'], value: 90 },
    },
  ];
  run(() => commands.forEach((command) => dispatch(command)));
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);

  if (pattern.value.entities.length === 0 && journal.value.length === 0) {
    seed();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <EditorRibbon
      :active-tool="activeTool"
      :active-constraint="activeConstraint"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :can-delete="selectedEntityIds.length > 0"
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
          :show-seam-allowance="showSeamAllowance"
          :show-constraints="showConstraints"
          :show-dimensions="showDimensions"
          :constraint-active="activeConstraint !== null"
          :constraint-picks="constraintPicks"
          :round-corner-active="cornerRoundActive"
          :round-corner-picks="cornerRoundPicks"
          :corner-round-preview-radius="cornerRoundPreviewRadius"
          @move-point="onMovePoint"
          @add-point="onAddPoint"
          @add-line="onAddLine"
          @add-curve="onAddCurve"
          @add-circle="onAddCircle"
          @constraint-pick="onConstraintPick"
          @round-corner-pick="onRoundCornerPick"
          @set-corner-round-radius="setCornerRoundRadius"
          @add-dimension="onAddDimension"
          @update-dimension="onUpdateDimension"
          @add-allowance="onAddAllowance"
          @set-seam-width="setSeamWidth"
          @marquee-change="marqueeActive = $event"
        />
      </div>

      <EditorSidebar
        :width="width"
        :collapsed="collapsed"
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
            @add-seam="onAddAllowance"
            @set-seam-width="setSeamWidth"
            @flip-seam="flipSeam"
            @remove-seam="removeSeam"
            @update-dimension="onUpdateDimension"
            @remove-constraint="removeConstraint"
            @set-corner-round-radius="setCornerRoundRadius"
            @remove-corner-round="removeCornerRound"
            @set-circle-radius="onSetCircleRadius"
          />

          <section
            class="space-y-1 text-sm"
            :class="hasSelection ? 'mt-3 border-t pt-3' : ''"
            aria-label="Workspace"
            data-testid="workspace-summary"
          >
            <h3
              class="text-xs font-semibold uppercase text-muted-foreground"
              :class="hasSelection ? '' : 'sr-only'"
            >
              Workspace
            </h3>
            <dl class="space-y-1">
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">Tool</dt>
                <dd data-testid="active-tool">{{ activeToolLabel }}</dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">Project</dt>
                <dd>#{{ props.id }}</dd>
              </div>
            </dl>
            <p class="text-xs text-muted-foreground">{{ journal.length }} command(s)</p>
            <p class="text-xs text-muted-foreground">{{ cutEdgeCount }} cut edge(s)</p>
            <p v-if="!hasSelection" class="pt-1 text-xs text-muted-foreground">
              Select a point, line or curve to inspect it.
            </p>
          </section>
        </template>

        <template #outline>
          <ul v-if="edges.length > 0" class="space-y-2" aria-label="Edges">
            <li
              v-for="edge in edges"
              :key="edge.id"
              class="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span class="font-mono text-muted-foreground">{{ edge.id }}</span>

              <div class="flex items-center gap-2">
                <template v-if="edge.seamId !== null">
                  <label
                    class="flex items-center gap-1 text-muted-foreground"
                    :data-testid="`seam-label-${edge.id}`"
                  >
                    Allowance
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      class="w-16 rounded-md border px-2 py-1 text-sm text-foreground"
                      :value="edge.seamWidth!"
                      :aria-label="`Allowance width in millimetres for ${edge.id}`"
                      :data-testid="`seam-width-${edge.id}`"
                      @change="onSeamWidthEdit(edge.seamId!, edge.seamWidth!, $event)"
                      @keydown.enter.prevent="
                        onSeamWidthEdit(edge.seamId!, edge.seamWidth!, $event)
                      "
                    />
                    mm
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    :aria-label="`Flip side of the seam allowance for ${edge.id}`"
                    :data-testid="`flip-seam-${edge.id}`"
                    @click="flipSeam(edge.seamId!, edge.seamSide!)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8" />
                      <path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13" />
                    </svg>
                    Flip side
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    :data-testid="`remove-seam-${edge.id}`"
                    @click="removeSeam(edge.seamId!)"
                  >
                    Remove allowance
                  </Button>
                </template>
                <template v-else>
                  <span class="text-muted-foreground" :data-testid="`seam-empty-${edge.id}`">
                    No allowance
                  </span>
                </template>

                <Button variant="outline" size="sm" @click="convert(edge.id, !edge.construction)">
                  {{ edge.construction ? 'Make cut edge' : 'Make construction' }}
                </Button>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">No edges yet.</p>
        </template>

        <template #dimensions>
          <ul v-if="dimensions.length > 0" class="space-y-3" aria-label="Dimensions">
            <li
              v-for="dimension in dimensions"
              :key="dimension.id"
              class="space-y-1 text-sm"
              :data-testid="`dimension-${dimension.id}`"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <span class="font-mono text-muted-foreground">{{ dimension.id }}</span>
                  <span class="ml-2 text-xs text-muted-foreground">
                    ({{ dimension.entities.join(', ') }})
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  :data-testid="`remove-dimension-${dimension.id}`"
                  @click="removeConstraint(dimension.id)"
                >
                  Remove
                </Button>
              </div>

              <div class="relative flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputmode="decimal"
                  class="w-20 rounded-md border px-2 py-1 text-sm"
                  :value="dimension.field"
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
                <span class="text-xs text-muted-foreground">mm</span>
                <Button
                  variant="outline"
                  size="sm"
                  :data-testid="`dimension-reference-${dimension.id}`"
                  @click="openDimensionPicker(dimension.id)"
                >
                  {{ dimension.state === 'broken' ? 'Re-link' : 'Reference' }}
                </Button>
                <span
                  class="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                  :data-dimension-state="dimension.state"
                  :data-testid="`dimension-state-${dimension.id}`"
                >
                  {{ dimension.stateLabel }}
                </span>

                <DimensionReferencePicker
                  v-if="dimensionPicker?.id === dimension.id"
                  :list-id="`dimension-drawer-reference-list-${dimension.id}`"
                  class="left-0 top-full mt-1"
                  :options="dimensionPickerOptions"
                  :active-index="activeDimensionPickerIndex"
                  @select="selectDimensionReference(dimension.id, $event)"
                />

                <select
                  class="rounded-md border px-2 py-1 text-sm"
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
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  step="1"
                  class="w-20 rounded-md border px-2 py-1 text-sm"
                  :value="dimension.offset"
                  :aria-label="`Offset for ${dimension.id}`"
                  :data-testid="`dimension-offset-${dimension.id}`"
                  @change="onDimensionOffsetEdit(dimension.id, $event)"
                />
                <span class="text-xs text-muted-foreground">offset (mm)</span>
              </div>

              <p
                v-if="dimension.state === 'referenced'"
                class="text-xs text-muted-foreground"
                :data-testid="`dimension-source-${dimension.id}`"
              >
                Source: <span class="font-mono">{{ dimension.sourceId }}</span>
              </p>
              <p
                v-else-if="dimension.state === 'broken'"
                class="text-xs text-destructive"
                :data-testid="`dimension-broken-${dimension.id}`"
              >
                Source {{ dimension.sourceId }} is missing. Type a value or press # to re-link.
              </p>

              <div v-if="dimension.sourceId !== null" class="flex flex-wrap items-center gap-2">
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
          <p v-else class="text-sm text-muted-foreground">No dimensions yet.</p>
        </template>

        <template #constraints>
          <ul v-if="otherConstraints.length > 0" class="space-y-2" aria-label="Constraints">
            <li
              v-for="constraint in otherConstraints"
              :key="constraint.id"
              class="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <div class="min-w-0">
                <span class="font-mono text-muted-foreground">{{ constraint.id }}</span>
                <span class="ml-2">{{ constraintLabel(constraint) }}</span>
                <span class="ml-2 text-xs text-muted-foreground">
                  ({{ constraintEntityIds(constraint).join(', ') }})
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                :data-testid="`remove-constraint-${constraint.id}`"
                @click="removeConstraint(constraint.id)"
              >
                Remove
              </Button>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">No constraints yet.</p>
        </template>

        <template #view>
          <div class="space-y-2">
            <label class="flex items-center gap-2 text-sm">
              <input v-model="showConstruction" type="checkbox" data-testid="show-construction" />
              Show construction
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                v-model="showSeamAllowance"
                type="checkbox"
                data-testid="show-seam-allowance"
              />
              Show seam allowance
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                v-model="includeConstruction"
                type="checkbox"
                data-testid="toggle-construction"
              />
              Include construction
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="showConstraints" type="checkbox" data-testid="show-constraints" />
              Show constraints
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="showDimensions" type="checkbox" data-testid="show-dimensions" />
              Show dimensions
            </label>
          </div>
        </template>
      </EditorSidebar>
    </div>
  </section>
</template>
