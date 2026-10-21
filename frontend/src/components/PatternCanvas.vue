<script setup lang="ts">
import {
  allPoints,
  bounds,
  constraintOffset,
  constraintOrientation,
  type CurveEntity,
  DEFAULT_DIMENSION_OFFSET,
  type DimensionOrientation,
  dimensionGeometry,
  dimensionOffsetForPointer,
  type DimensionLayout,
  dimensionState,
  dimensionValue,
  type DimensionState,
  type DistanceConstraint,
  entitiesInRect,
  type EntityId,
  inferDimensionOrientation,
  type LineEntity,
  measureLinearDimension,
  type PatternDocument,
  type PointEntity,
  type Rect,
  seamAllowancePaths,
  seamForEdge,
  type Vec2,
} from '@sewcraft/geometry';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { curvePath, polylinePath } from '@/lib/canvas-render';
import type { ConstraintPick } from '@/lib/constraint-tools';
import { CONSTRAINT_ICONS, constraintMarkers, type ConstraintMarker } from '@/lib/constraint-view';
import {
  dimensionAccessibleName,
  dimensionLabelWidth,
  dimensionPatchForEdit,
  dimensionSegments,
  filterReferenceOptions,
  formatDimensionField,
  formatDimensionLabel,
  formatDimensionValue,
  isReferenceEditText,
  parseDimensionEdit,
  referenceOptions,
  referenceSearchText,
  type DimensionPatch,
  type DimensionPlacement,
  type DimensionReferenceOption,
  type DimensionSegment,
} from '@/lib/dimensions';
import type { EditorTool } from '@/lib/editor-tools';
import { resolveLineEndpoint, sameEndpoint, type LineEndpoint } from '@/lib/line-tool';
import {
  applySelection,
  rectMode,
  selectionModeFrom,
  toggleSelection,
  type SelectionMode,
} from '@/lib/selection';
import { snapPoint, snapToGrid } from '@/lib/snap';
import {
  fitToBounds,
  niceStep,
  panBy,
  screenToWorld,
  ticksAlong,
  viewportTransform,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
  type Size,
  type Viewport,
} from '@/lib/viewport';

import DimensionReferencePicker from './DimensionReferencePicker.vue';
import SeamWidthEditor from './SeamWidthEditor.vue';

interface LineView {
  line: LineEntity;
  start: PointEntity;
  end: PointEntity;
}

interface CurveView {
  curve: CurveEntity;
  d: string;
}

interface Hit {
  id: EntityId;
  kind: string;
}

/** A bare-canvas drag that may become a rectangular selection. */
interface MarqueeState {
  start: Vec2;
  current: Vec2;
  mode: SelectionMode;
  latched: boolean;
}

/** Screen pixels the pointer must travel before a click becomes a marquee. */
const MARQUEE_THRESHOLD = 4;

interface SeamView {
  id: EntityId;
  edge: EntityId;
  kind: 'line' | 'curve';
  width: number;
  d: string;
  selfIntersects: boolean;
}

/** A fully resolved dimension, ready to render in world and screen space. */
interface DimensionDrawing {
  id: EntityId;
  constraint: DistanceConstraint;
  layout: DimensionLayout;
  segments: DimensionSegment[];
  /** Label text: `120`, `(120)` or `[120]`, by state. */
  value: string;
  /** The effective number without decoration, for accessible names. */
  measured: string;
  state: DimensionState;
  /** The linked source, when the dimension records one. */
  sourceId?: EntityId;
  /** The label's full accessible name, including the state and source. */
  accessibleName: string;
  preview: boolean;
  draggable: boolean;
  editable: boolean;
  dragging: boolean;
}

/** A dimension value positioned and oriented in screen space. */
interface DimensionLabelView {
  id: EntityId;
  constraint: DistanceConstraint;
  value: string;
  measured: string;
  state: DimensionState;
  sourceId?: EntityId;
  accessibleName: string;
  width: number;
  x: number;
  y: number;
  angle: number;
  preview: boolean;
  draggable: boolean;
  editable: boolean;
}

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    tool: EditorTool;
    selectedEntityIds?: EntityId[];
    fitToken?: number;
    showSeamAllowance?: boolean;
    showConstraints?: boolean;
    showDimensions?: boolean;
    constraintActive?: boolean;
    constraintPicks?: ConstraintPick[];
  }>(),
  {
    selectedEntityIds: () => [],
    fitToken: 0,
    showSeamAllowance: true,
    showConstraints: false,
    showDimensions: true,
    constraintActive: false,
    constraintPicks: () => [],
  },
);

const emit = defineEmits<{
  'update:selectedEntityIds': [ids: EntityId[]];
  'marquee-change': [active: boolean];
  'move-point': [id: EntityId, x: number, y: number];
  'add-point': [x: number, y: number];
  'add-line': [start: LineEndpoint, end: LineEndpoint];
  'add-curve': [points: [EntityId, EntityId, EntityId, EntityId]];
  'constraint-pick': [pick: ConstraintPick];
  'add-dimension': [placement: DimensionPlacement];
  'update-dimension': [id: EntityId, patch: DimensionPatch];
  'add-allowance': [edge: EntityId];
  'set-seam-width': [id: EntityId, width: number];
}>();

const svg = ref<SVGSVGElement | null>(null);
const viewport = ref<Viewport>({ x: -40, y: -40, scale: 1 });
const size = ref<Size>({ width: 800, height: 600 });
let resizeObserver: ResizeObserver | null = null;
const dragState = ref<{ id: EntityId; x: number; y: number; origin: Vec2 } | null>(null);
const panState = ref<{ start: Vec2; origin: Viewport } | null>(null);
const marqueeState = ref<MarqueeState | null>(null);
const pending = ref<EntityId[]>([]);
/** The line gesture's first endpoint; `null` until the first click. */
const lineStart = ref<LineEndpoint | null>(null);
/** The snapped pointer position while a line gesture is pending. */
const linePreview = ref<Vec2 | null>(null);
const spaceHeld = ref(false);

/** Points picked for a dimension that has not yet been placed. */
const dimensionPending = ref<EntityId[]>([]);
/** The dimension being placed; its orientation/offset follow the pointer. */
const dimensionPlacement = ref<DimensionPlacement | null>(null);
/** Live drag of an existing dimension line, in world space. */
const dimensionDrag = ref<{
  id: EntityId;
  a: EntityId;
  b: EntityId;
  orientation: DimensionOrientation;
  startOffset: number;
  offset: number;
} | null>(null);
/** The inline value editor, keyed to the dimension being edited. */
const editingDimension = ref<{ id: EntityId; value: string } | null>(null);
const dimensionInput = ref<HTMLInputElement | null>(null);
/** The inline seam-width editor, keyed to the seam and anchored in screen space. */
const editingSeam = ref<{ id: EntityId; width: number; x: number; y: number } | null>(null);

const points = computed(() =>
  allPoints(props.document).map((point) =>
    dragState.value && dragState.value.id === point.id
      ? { ...point, x: dragState.value.x, y: dragState.value.y }
      : point,
  ),
);

const pointById = computed(() => new Map(points.value.map((point) => [point.id, point])));

/** Membership test for every selected entity's highlight. */
const selectedIds = computed(() => new Set(props.selectedEntityIds));

/** The marquee's screen-space rectangle, live while the pointer moves. */
const marqueeRect = computed(() => {
  const state = marqueeState.value;
  if (state === null) return null;
  return {
    x: Math.min(state.start.x, state.current.x),
    y: Math.min(state.start.y, state.current.y),
    width: Math.abs(state.current.x - state.start.x),
    height: Math.abs(state.current.y - state.start.y),
  };
});

/** The marquee in world coordinates, used for hit-testing and preview. */
const marqueeWorldRect = computed<Rect | null>(() => {
  const state = marqueeState.value;
  if (state === null) return null;
  const start = screenToWorld(viewport.value, state.start);
  const end = screenToWorld(viewport.value, state.current);
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y),
  };
});

/** Entities the latched marquee would select with the captured mode. */
const marqueeCandidates = computed(() => {
  const state = marqueeState.value;
  const rect = marqueeWorldRect.value;
  if (state === null || rect === null || !state.latched) return new Set<EntityId>();
  return new Set(entitiesInRect(props.document, rect, rectMode(state.start.x, state.current.x)));
});

const lines = computed(() =>
  props.document.entities
    .filter((entity): entity is LineEntity => entity.kind === 'line')
    .flatMap((line): LineView[] => {
      const start = pointById.value.get(line.start);
      const end = pointById.value.get(line.end);
      if (!start || !end) return [];
      return [{ line, start, end }];
    }),
);

const curves = computed(() =>
  props.document.entities
    .filter((entity): entity is CurveEntity => entity.kind === 'curve')
    .flatMap((curve): CurveView[] => {
      const resolved = [curve.p0, curve.p1, curve.p2, curve.p3]
        .map((id) => pointById.value.get(id))
        .filter((point): point is PointEntity => point !== undefined);
      if (resolved.length !== 4) return [];
      const [p0, p1, p2, p3] = resolved;
      return [{ curve, d: curvePath([p0!, p1!, p2!, p3!]) }];
    }),
);

/**
 * Seam allowances are a render-only offset layer: hidden entirely when the
 * presentation toggle is off, and never part of the document the UI mutates.
 */
const seams = computed<SeamView[]>(() => {
  if (!props.showSeamAllowance) return [];
  return seamAllowancePaths(props.document).map((allowance) => {
    const seam = seamForEdge(props.document, allowance.edge)!;
    const entity = props.document.entities.find((candidate) => candidate.id === allowance.edge) as
      LineEntity | CurveEntity;
    return {
      id: seam.id,
      edge: allowance.edge,
      kind: entity.kind,
      width: seam.width,
      d: polylinePath(allowance.path),
      selfIntersects: allowance.selfIntersections.length > 0,
    };
  });
});

/** Screen-space diameter of a constraint icon, in pixels. */
const CONSTRAINT_ICON_SIZE = 18;
/** Distance between stacked icons when several constraints share an anchor. */
const CONSTRAINT_ICON_STEP = 20;

/**
 * Constraint icons are a render-only overlay, like the seam layer: driven by
 * the presentation toggle and never part of the document the UI mutates.
 *
 * Markers are laid out in screen space so they stay the same small size at any
 * zoom, and constraints that share a midpoint are staggered instead of drawn
 * on top of each other.
 */
const constraintLayer = computed<ConstraintMarker[]>(() => {
  if (!props.showConstraints) return [];

  const stacks = new Map<string, number>();
  return constraintMarkers(props.document).map((marker) => {
    const screen = worldToScreen(viewport.value, marker);
    // Group by the shared world anchor, not screen proximity, so icons do not
    // jump between stacks as the viewport pans or zooms.
    const anchor = `${Math.round(marker.x * 1000)}:${Math.round(marker.y * 1000)}`;
    const index = stacks.get(anchor) ?? 0;
    stacks.set(anchor, index + 1);

    return {
      ...marker,
      x: screen.x + CONSTRAINT_ICON_SIZE / 2 + index * CONSTRAINT_ICON_STEP,
      y: screen.y - CONSTRAINT_ICON_SIZE / 2,
    };
  });
});

const pendingIds = computed(() => new Set(pending.value));
/** The document point reused as the line start, highlighted while pending. */
const pendingLineStartId = computed(() =>
  lineStart.value?.kind === 'point' ? lineStart.value.id : null,
);
/**
 * World position of the pending start. An id is always current because the
 * document watcher clears a start whose point disappeared.
 */
const pendingLineStart = computed<Vec2 | null>(() => {
  const start = lineStart.value;
  if (start === null) return null;
  if (start.kind === 'new') return { x: start.x, y: start.y };

  const point = pointById.value.get(start.id)!;
  return { x: point.x, y: point.y };
});
const gridStep = computed(() => niceStep(viewport.value.scale));
const gridPath = computed(() => `M ${gridStep.value} 0 L 0 0 0 ${gridStep.value}`);
const transform = computed(() => viewportTransform(viewport.value));
const visible = computed(() => visibleWorldRect(viewport.value, size.value));
const xTicks = computed(() => ticksAlong(visible.value, 'x', gridStep.value));
const yTicks = computed(() => ticksAlong(visible.value, 'y', gridStep.value));
const cursorClass = computed(() =>
  props.constraintActive || props.tool !== 'select' ? 'cursor-crosshair' : 'cursor-default',
);
const pickedPointIds = computed(
  () =>
    new Set(props.constraintPicks.filter((pick) => pick.kind === 'point').map((pick) => pick.id)),
);
const pickedLineIds = computed(
  () =>
    new Set(props.constraintPicks.filter((pick) => pick.kind === 'line').map((pick) => pick.id)),
);

const distanceConstraints = computed(() =>
  props.document.constraints.filter(
    (constraint): constraint is DistanceConstraint => constraint.type === 'distance',
  ),
);

/** Committed dimensions can be dragged only with the tools that own a placed line. */
const dimensionDragEnabled = computed(
  () => !props.constraintActive && (props.tool === 'select' || props.tool === 'dimension'),
);

function drawingFor(constraint: DistanceConstraint, preview: boolean): DimensionDrawing | null {
  const drag = dimensionDrag.value;
  const placed =
    drag !== null && drag.id === constraint.id
      ? { ...constraint, offset: drag.offset }
      : constraint;
  const layout = dimensionGeometry(props.document, placed);
  if (layout === null) return null;

  // `layout` resolves the same points, so the effective value is always present.
  const value = dimensionValue(props.document, placed)!;
  const state = dimensionState(props.document, placed);

  return {
    id: constraint.id,
    constraint,
    layout,
    segments: dimensionSegments(layout),
    value: formatDimensionLabel(value, state),
    measured: formatDimensionValue(value),
    state,
    ...(constraint.reference === undefined ? {} : { sourceId: constraint.reference }),
    accessibleName: dimensionAccessibleName(value, state, constraint.reference),
    preview,
    draggable: !preview && dimensionDragEnabled.value,
    editable: !preview && !props.constraintActive,
    dragging: drag !== null && drag.id === constraint.id,
  };
}

/** The dimension currently being placed, or `null` when no placement is active. */
const dimensionPreviewConstraint = computed<DistanceConstraint | null>(() => {
  const placement = dimensionPlacement.value;
  if (placement === null) return null;

  const measured = measureLinearDimension(
    props.document,
    placement.a,
    placement.b,
    placement.orientation,
  )!;
  if (measured <= 0) return null;

  // A dimension being placed is a driven preview: it measures without a value.
  return {
    id: 'dimension-preview',
    type: 'distance',
    a: placement.a,
    b: placement.b,
    orientation: placement.orientation,
    offset: placement.offset,
  };
});

/**
 * Every dimension stroke, plus the in-progress placement. Dimensions are a
 * render-only view of distance constraints: hiding them never changes the
 * document, and the preview only appears while the dimension tool is placing.
 */
const dimensionDrawings = computed<DimensionDrawing[]>(() => {
  const committed = props.showDimensions
    ? distanceConstraints.value.flatMap((constraint) => {
        const drawing = drawingFor(constraint, false);
        return drawing === null ? [] : [drawing];
      })
    : [];

  const previewConstraint = dimensionPreviewConstraint.value;
  const preview = previewConstraint === null ? null : drawingFor(previewConstraint, true);
  return preview === null ? committed : [...committed, preview];
});

const dimensionLabels = computed<DimensionLabelView[]>(() =>
  dimensionDrawings.value.map((drawing) => {
    const screen = worldToScreen(viewport.value, drawing.layout.label.position);
    return {
      id: drawing.id,
      constraint: drawing.constraint,
      value: drawing.value,
      measured: drawing.measured,
      state: drawing.state,
      ...(drawing.sourceId === undefined ? {} : { sourceId: drawing.sourceId }),
      accessibleName: drawing.accessibleName,
      width: dimensionLabelWidth(drawing.value),
      x: screen.x,
      y: screen.y,
      angle: drawing.layout.label.angleDegrees,
      preview: drawing.preview,
      draggable: drawing.draggable,
      editable: drawing.editable,
    };
  }),
);

/** Where the inline editor sits, in canvas pixels. */
const dimensionEditor = computed(() => {
  const editing = editingDimension.value;
  if (editing === null) return null;

  const label = dimensionLabels.value.find((entry) => entry.id === editing.id)!;
  return {
    id: editing.id,
    value: editing.value,
    x: label.x,
    y: label.y,
  };
});

/** The `#` picker's transient state; `null` while the field is not linking. */
const dimensionPicker = ref<{ text: string; activeIndex: number } | null>(null);

/** The dimension the inline editor is editing, used to resolve link targets. */
const editingConstraint = computed<DistanceConstraint>(() => {
  const editing = editingDimension.value!;
  return distanceConstraints.value.find((constraint) => constraint.id === editing.id)!;
});

/** Every row the open picker offers for the edited dimension. */
const dimensionPickerOptions = computed<DimensionReferenceOption[]>(() => {
  const constraint = editingConstraint.value;
  return filterReferenceOptions(
    referenceOptions(props.document, constraint),
    dimensionPicker.value!.text,
  );
});

/** The row Enter would pick, or `null` when the list is empty. */
const activePickerOption = computed<DimensionReferenceOption | null>(() => {
  const picker = dimensionPicker.value;
  if (picker === null || dimensionPickerOptions.value.length === 0) return null;
  return dimensionPickerOptions.value[
    Math.min(picker.activeIndex, dimensionPickerOptions.value.length - 1)
  ]!;
});

/** The `aria-activedescendant` target while the picker is open. */
const pickerActiveDescendant = computed<string | undefined>(() =>
  activePickerOption.value === null
    ? undefined
    : `dimension-reference-list-${activePickerOption.value.id}`,
);

/** The row the picker highlights, clamped to the filtered list. */
const pickerActiveIndex = computed<number>(() =>
  activePickerOption.value === null
    ? -1
    : dimensionPickerOptions.value.findIndex(
        (option) => option.id === activePickerOption.value!.id,
      ),
);

function optionsFor(id: EntityId): DimensionReferenceOption[] {
  const constraint = distanceConstraints.value.find((entry) => entry.id === id)!;
  return referenceOptions(props.document, constraint);
}

function movePicker(step: number): void {
  const picker = dimensionPicker.value!;
  const count = dimensionPickerOptions.value.length;
  if (count === 0) return;
  dimensionPicker.value = {
    text: picker.text,
    activeIndex: (picker.activeIndex + step + count) % count,
  };
}

function xTickPosition(value: number): number {
  return worldToScreen(viewport.value, { x: value, y: 0 }).x;
}

function yTickPosition(value: number): number {
  return worldToScreen(viewport.value, { x: 0, y: value }).y;
}

function pointClass(point: PointEntity): string {
  if (pickedPointIds.value.has(point.id)) return 'fill-primary stroke-primary-foreground';
  if (selectedIds.value.has(point.id)) return 'fill-primary stroke-primary-foreground';
  if (marqueeCandidates.value.has(point.id)) {
    return 'fill-primary stroke-primary-foreground opacity-60';
  }
  if (pendingIds.value.has(point.id) || point.id === pendingLineStartId.value) {
    return 'fill-accent stroke-accent-foreground';
  }
  return point.construction ? 'fill-muted-foreground' : 'fill-foreground';
}

function entityClass(entity: { id: EntityId; construction: boolean }): string {
  if (pickedLineIds.value.has(entity.id) || selectedIds.value.has(entity.id)) {
    return 'text-primary';
  }
  if (marqueeCandidates.value.has(entity.id)) return 'text-primary opacity-60';
  return entity.construction ? 'text-muted-foreground' : 'text-foreground';
}

function lineWidth(id: EntityId): number {
  return pickedLineIds.value.has(id) || selectedIds.value.has(id) || marqueeCandidates.value.has(id)
    ? 3
    : 2;
}

function svgRect(): DOMRect {
  return svg.value!.getBoundingClientRect();
}

function updateSize(): void {
  const rect = svgRect();
  size.value = { width: rect.width, height: rect.height };
}

function screenPoint(event: { clientX: number; clientY: number }): Vec2 {
  const rect = svgRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function hitEntity(event: Event): Hit | null {
  const seamElement = (event.target as Element).closest('[data-seam-id]');
  if (seamElement) {
    const seam = seams.value.find(
      (candidate) => candidate.id === seamElement.getAttribute('data-seam-id'),
    )!;
    return { id: seam.edge, kind: seam.kind };
  }

  const element = (event.target as Element).closest('[data-entity-id]');
  if (!element) return null;
  return {
    id: element.getAttribute('data-entity-id')!,
    kind: element.getAttribute('data-kind')!,
  };
}

function snappedPoint(world: Vec2): Vec2 {
  const candidates = points.value.map((point) => ({ x: point.x, y: point.y }));
  return snapPoint(world, candidates);
}

/**
 * Dimension placement: a line picks its own endpoints, points are collected in
 * pairs, and the next click after a complete pair drops the dimension line.
 */
function onDimensionPointer(hit: Hit | null): void {
  if (dimensionPlacement.value !== null) {
    commitDimensionPlacement();
    return;
  }

  if (hit === null || hit.kind === 'curve') {
    dimensionPending.value = [];
    return;
  }

  if (hit.kind === 'line') {
    const line = props.document.entities.find(
      (entity): entity is LineEntity => entity.id === hit.id && entity.kind === 'line',
    )!;
    dimensionPending.value = [];
    startDimensionPlacement(line.start, line.end);
    return;
  }

  const ids = dimensionPending.value.includes(hit.id)
    ? dimensionPending.value
    : [...dimensionPending.value, hit.id];
  if (ids.length < 2) {
    dimensionPending.value = ids;
    return;
  }

  dimensionPending.value = [];
  startDimensionPlacement(ids[0]!, ids[1]!);
}

function startDimensionPlacement(a: EntityId, b: EntityId): void {
  dimensionPlacement.value = {
    a,
    b,
    orientation: 'aligned',
    offset: DEFAULT_DIMENSION_OFFSET,
  };
}

function commitDimensionPlacement(): void {
  const placement = dimensionPlacement.value!;
  dimensionPlacement.value = null;
  emit('add-dimension', placement);
}

/** Follow the pointer while placing, choosing the axis and offset live. */
function updateDimensionPlacement(screen: Vec2): void {
  const placement = dimensionPlacement.value!;

  const world = screenToWorld(viewport.value, screen);
  const orientation = inferDimensionOrientation(props.document, placement.a, placement.b, world);
  dimensionPlacement.value = {
    ...placement,
    orientation,
    offset: dimensionOffsetForPointer(props.document, placement.a, placement.b, orientation, world),
  };
}

function beginDimensionDrag(constraint: DistanceConstraint, event: PointerEvent): void {
  event.stopPropagation();
  event.preventDefault();
  const offset = constraintOffset(constraint);
  dimensionDrag.value = {
    id: constraint.id,
    a: constraint.a,
    b: constraint.b,
    orientation: constraintOrientation(constraint),
    startOffset: offset,
    offset,
  };
  addPointerListeners();
}

function labelClass(label: DimensionLabelView): string {
  switch (label.state) {
    case 'referenced':
      return 'fill-dimension-reference';
    case 'broken':
      return 'fill-destructive';
    case 'driven':
      return 'fill-muted-foreground';
    case 'set':
      return 'fill-foreground';
  }
}

function onDimensionDoubleClick(label: DimensionLabelView): void {
  if (!label.editable) return;
  void beginDimensionEdit(label.constraint);
}

async function beginDimensionEdit(constraint: DistanceConstraint): Promise<void> {
  // The label only renders for a resolvable span, so an effective value exists.
  const value = dimensionValue(props.document, constraint)!;
  const state = dimensionState(props.document, constraint);
  editingDimension.value = {
    id: constraint.id,
    value: formatDimensionField(constraint, value, state),
  };
  dimensionPicker.value = null;
  await nextTick();
  dimensionInput.value!.focus();
  dimensionInput.value!.select();
}

function onDimensionEditInput(event: Event): void {
  const editing = editingDimension.value!;
  const value = (event.target as HTMLInputElement).value;
  editingDimension.value = { id: editing.id, value };
  dimensionPicker.value = isReferenceEditText(value)
    ? { text: referenceSearchText(value), activeIndex: 0 }
    : null;
}

/** Arrow keys move the picker, Enter links or commits, Escape closes or cancels. */
function onDimensionEditorKeydown(event: KeyboardEvent): void {
  if (dimensionPicker.value !== null) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      movePicker(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      movePicker(-1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      dimensionPicker.value = null;
      return;
    }
    if (event.key === 'Enter' && activePickerOption.value !== null) {
      event.preventDefault();
      selectReference(activePickerOption.value.id);
      return;
    }
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    applyDimensionEdit();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelDimensionEdit();
  }
}

/** Pick a row: link the edited dimension and close the field. */
function selectReference(id: EntityId): void {
  const editing = editingDimension.value!;
  editingDimension.value = null;
  dimensionPicker.value = null;
  emit('update-dimension', editing.id, { reference: id });
}

/** Enter: apply a set, driven, unlink or reference edit; keep a typo editable. */
function applyDimensionEdit(): void {
  const editing = editingDimension.value!;
  const edit = parseDimensionEdit(editing.value);
  if (edit.kind === 'invalid') return;

  const patch = dimensionPatchForEdit(edit, optionsFor(editing.id));
  if (patch === null) return;

  editingDimension.value = null;
  dimensionPicker.value = null;
  emit('update-dimension', editing.id, patch);
}

/** Blur: commit an applicable edit and discard an invalid or unresolved one. */
function finishDimensionEdit(): void {
  const editing = editingDimension.value;
  dimensionPicker.value = null;
  if (editing === null) return;

  const edit = parseDimensionEdit(editing.value);
  editingDimension.value = null;
  if (edit.kind === 'invalid') return;

  const patch = dimensionPatchForEdit(edit, optionsFor(editing.id));
  if (patch !== null) emit('update-dimension', editing.id, patch);
}

function cancelDimensionEdit(): void {
  editingDimension.value = null;
  dimensionPicker.value = null;
}

/** Double-click on the dashed allowance opens its inline width editor. */
function onSeamDoubleClick(seam: SeamView, event: MouseEvent): void {
  if (props.constraintActive) return;

  const point = screenPoint(event);
  editingSeam.value = { id: seam.id, width: seam.width, x: point.x, y: point.y };
}

function commitSeamWidth(width: number): void {
  const editing = editingSeam.value!;

  editingSeam.value = null;
  emit('set-seam-width', editing.id, width);
}

function onPointerDown(event: PointerEvent): void {
  updateSize();
  const screen = screenPoint(event);

  if (event.button === 1 || spaceHeld.value) {
    beginPan(screen);
    return;
  }
  if (event.button !== 0) return;

  const hit = hitEntity(event);
  if (props.constraintActive) {
    if (hit !== null) {
      emit('constraint-pick', { id: hit.id, kind: hit.kind as ConstraintPick['kind'] });
    }
    return;
  }

  switch (props.tool) {
    case 'select': {
      const mode = selectionModeFrom(event);
      if (hit === null) {
        // Touch keeps its single tap/pan; a mouse or pen drag is a marquee.
        if (event.pointerType === 'touch') {
          if (mode === 'replace') emit('update:selectedEntityIds', []);
          beginPan(screen);
        } else {
          startMarquee(screen, mode);
        }
        break;
      }

      selectEntity(hit.id, mode);
      if (mode !== 'replace') break;
      if (hit.kind === 'point') {
        beginDrag(hit.id, pointById.value.get(hit.id)!);
      } else {
        beginPan(screen);
      }
      break;
    }
    case 'add_point':
      emitAddPoint(screen);
      break;
    case 'add_line':
      onLinePointer(hit, screen);
      break;
    case 'add_curve':
      selectPendingPoint(hit, 4);
      break;
    case 'dimension':
      onDimensionPointer(hit);
      break;
    case 'add_allowance':
      if (hit !== null && hit.kind !== 'point') {
        emit('add-allowance', hit.id);
      }
      break;
  }
}

function onPointerMove(event: PointerEvent): void {
  const screen = screenPoint(event);

  if (marqueeState.value) {
    updateMarquee(screen);
  } else if (dimensionDrag.value) {
    const drag = dimensionDrag.value;
    dimensionDrag.value = {
      ...drag,
      offset: dimensionOffsetForPointer(
        props.document,
        drag.a,
        drag.b,
        drag.orientation,
        screenToWorld(viewport.value, screen),
      ),
    };
  } else if (panState.value) {
    const dx = screen.x - panState.value.start.x;
    const dy = screen.y - panState.value.start.y;
    viewport.value = panBy(panState.value.origin, dx, dy);
  } else if (dragState.value) {
    const world = snapToGrid(screenToWorld(viewport.value, screen));
    dragState.value = { ...dragState.value, x: world.x, y: world.y };
  }
}

/** Live dimension preview while placing; the canvas-level pointer move. */
function onCanvasPointerMove(event: PointerEvent): void {
  if (dimensionPlacement.value !== null && dimensionDrag.value === null) {
    updateDimensionPlacement(screenPoint(event));
  }

  if (props.tool === 'add_line' && lineStart.value !== null) {
    linePreview.value = snappedPoint(screenToWorld(viewport.value, screenPoint(event)));
  }
}

/** Drop every in-flight pointer interaction without emitting a command. */
function cancelPointerInteraction(): void {
  cancelMarquee();
  dimensionDrag.value = null;
  dragState.value = null;
  panState.value = null;
  removePointerListeners();
}

function onPointerCancel(): void {
  cancelPointerInteraction();
}

function onPointerUp(): void {
  if (marqueeState.value) {
    finishMarquee();
    removePointerListeners();
    return;
  }

  if (dimensionDrag.value) {
    const { id, offset, startOffset } = dimensionDrag.value;
    dimensionDrag.value = null;
    if (offset !== startOffset) {
      emit('update-dimension', id, { offset });
    }
  }

  if (dragState.value) {
    const { id, x, y, origin } = dragState.value;
    dragState.value = null;
    if (x !== origin.x || y !== origin.y) {
      emit('move-point', id, x, y);
    }
  }

  panState.value = null;
  removePointerListeners();
}

function onWheel(event: WheelEvent): void {
  // The rectangle must not change scale under the pointer mid-gesture.
  if (marqueeState.value !== null) return;
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
  viewport.value = zoomAt(viewport.value, screenPoint(event), factor);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && marqueeState.value !== null) {
    event.preventDefault();
    cancelPointerInteraction();
    return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    spaceHeld.value = true;
  }
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.code === 'Space') {
    spaceHeld.value = false;
  }
}

function emitAddPoint(screen: Vec2): void {
  const world = snappedPoint(screenToWorld(viewport.value, screen));
  emit('add-point', world.x, world.y);
}

function selectPendingPoint(hit: Hit | null, required: number): void {
  if (!hit || hit.kind !== 'point') {
    pending.value = [];
    return;
  }

  const ids = pending.value.includes(hit.id) ? pending.value : [...pending.value, hit.id];
  if (ids.length === required) {
    commitPending(ids);
  } else {
    pending.value = ids;
  }
}

function commitPending(ids: EntityId[]): void {
  pending.value = [];
  emit('add-curve', [ids[0]!, ids[1]!, ids[2]!, ids[3]!]);
}

/**
 * The line gesture: a point hit is reused by id, a bare canvas resolves to the
 * snapped position (which may coincide with an existing point). The first click
 * only stores a provisional start; the second emits both endpoints so the
 * editor can commit the points and the line as one undoable gesture.
 */
function onLinePointer(hit: Hit | null, screen: Vec2): void {
  const endpoint: LineEndpoint =
    hit !== null && hit.kind === 'point'
      ? { kind: 'point', id: hit.id }
      : resolveLineEndpoint(props.document, screenToWorld(viewport.value, screen));

  const start = lineStart.value;
  if (start === null) {
    lineStart.value = endpoint;
    linePreview.value = null;
    return;
  }

  if (sameEndpoint(start, endpoint)) return;

  lineStart.value = null;
  linePreview.value = null;
  emit('add-line', start, endpoint);
}

/** Combine one clicked entity with the current selection under `mode`. */
function selectEntity(id: EntityId, mode: SelectionMode): void {
  const current = props.selectedEntityIds;
  if (mode === 'replace') {
    emit('update:selectedEntityIds', [id]);
  } else if (mode === 'add') {
    emit('update:selectedEntityIds', toggleSelection(current, id));
  } else {
    emit('update:selectedEntityIds', applySelection(current, [id], 'subtract'));
  }
}

function startMarquee(screen: Vec2, mode: SelectionMode): void {
  marqueeState.value = { start: screen, current: screen, mode, latched: false };
  emit('marquee-change', true);
  addPointerListeners();
}

/** Move the rectangle and latch it once the pointer has travelled far enough. */
function updateMarquee(screen: Vec2): void {
  const state = marqueeState.value!;
  const distance = Math.hypot(screen.x - state.start.x, screen.y - state.start.y);
  marqueeState.value = {
    ...state,
    current: screen,
    latched: state.latched || distance >= MARQUEE_THRESHOLD,
  };
}

/** Commit a latched rectangle, or treat a sub-threshold drag as a click. */
function finishMarquee(): void {
  const state = marqueeState.value!;
  const rect = marqueeWorldRect.value!;
  const hits = state.latched
    ? entitiesInRect(props.document, rect, rectMode(state.start.x, state.current.x))
    : [];
  marqueeState.value = null;
  emit('marquee-change', false);

  if (!state.latched) {
    if (state.mode === 'replace') emit('update:selectedEntityIds', []);
    return;
  }

  emit('update:selectedEntityIds', applySelection(props.selectedEntityIds, hits, state.mode));
}

/** Discard the rectangle and leave the previous selection untouched. */
function cancelMarquee(): void {
  if (marqueeState.value === null) return;
  marqueeState.value = null;
  emit('marquee-change', false);
}

function beginPan(screen: Vec2): void {
  panState.value = { start: screen, origin: viewport.value };
  addPointerListeners();
}

function beginDrag(id: EntityId, origin: Vec2): void {
  dragState.value = { id, x: origin.x, y: origin.y, origin };
  addPointerListeners();
}

function addPointerListeners(): void {
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
}

function removePointerListeners(): void {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerCancel);
}

function fit(): void {
  const documentBounds = bounds(props.document);
  if (documentBounds) {
    updateSize();
    viewport.value = fitToBounds(documentBounds, size.value);
  }
}

function onWindowBlur(): void {
  cancelPointerInteraction();
}

onMounted(() => {
  updateSize();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('resize', updateSize);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(svg.value!);
  }
  fit();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onWindowBlur);
  window.removeEventListener('resize', updateSize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  removePointerListeners();
});

watch(
  () => props.fitToken,
  () => fit(),
);

watch(
  () => props.tool,
  () => {
    pending.value = [];
    lineStart.value = null;
    linePreview.value = null;
    dimensionPending.value = [];
    dimensionPlacement.value = null;
    editingDimension.value = null;
    cancelPointerInteraction();
    editingSeam.value = null;
    dimensionDrag.value = null;
  },
);

// Any document edit invalidates the inline editor: the constraint may have
// moved, been removed, or been undone underneath it. A pending line start that
// referenced a point also disappears when that point does.
watch(
  () => props.document,
  () => {
    editingDimension.value = null;
    editingSeam.value = null;
    if (pendingLineStartId.value !== null && !pointById.value.has(pendingLineStartId.value)) {
      lineStart.value = null;
      linePreview.value = null;
    }
  },
);

watch(
  () => props.showDimensions,
  (visible) => {
    if (!visible) editingDimension.value = null;
    if (!visible && dimensionDrag.value) cancelPointerInteraction();
  },
);

watch(
  () => props.showSeamAllowance,
  (visible) => {
    if (!visible) editingSeam.value = null;
  },
);
</script>

<template>
  <div
    class="relative h-full min-h-0 w-full overflow-hidden rounded-md border bg-muted/30"
    :class="cursorClass"
  >
    <svg
      ref="svg"
      class="block h-full w-full touch-none select-none"
      role="img"
      aria-label="Pattern canvas"
      @pointerdown="onPointerDown"
      @pointermove="onCanvasPointerMove"
      @wheel.prevent="onWheel"
    >
      <defs>
        <pattern
          id="sewcraft-grid"
          patternUnits="userSpaceOnUse"
          :width="gridStep"
          :height="gridStep"
        >
          <path
            :d="gridPath"
            fill="none"
            class="stroke-border"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        </pattern>
      </defs>

      <g :transform="transform">
        <rect
          x="-100000"
          y="-100000"
          width="200000"
          height="200000"
          fill="url(#sewcraft-grid)"
          data-testid="grid"
        />

        <g class="pointer-events-none" data-testid="seam-layer">
          <path
            v-for="seam in seams"
            :key="seam.edge"
            :d="seam.d"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="6 3"
            vector-effect="non-scaling-stroke"
            :class="seam.selfIntersects ? 'text-destructive' : 'text-muted-foreground'"
            :data-seam-edge="seam.edge"
          />
        </g>

        <g data-testid="seam-hit-layer">
          <path
            v-for="seam in seams"
            :key="`hit-${seam.id}`"
            :d="seam.d"
            fill="none"
            stroke="transparent"
            stroke-width="12"
            vector-effect="non-scaling-stroke"
            class="pointer-events-auto cursor-pointer"
            :data-seam-hit="seam.edge"
            :data-seam-id="seam.id"
            @dblclick.stop.prevent="onSeamDoubleClick(seam, $event)"
          />
        </g>

        <g>
          <template v-for="entry in lines" :key="entry.line.id">
            <line
              :x1="entry.start.x"
              :y1="entry.start.y"
              :x2="entry.end.x"
              :y2="entry.end.y"
              :class="entityClass(entry.line)"
              :stroke-dasharray="entry.line.construction ? '4 4' : undefined"
              :stroke-width="lineWidth(entry.line.id)"
              stroke="currentColor"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
              :data-entity-id="entry.line.id"
              data-kind="line"
            />
            <line
              :x1="entry.start.x"
              :y1="entry.start.y"
              :x2="entry.end.x"
              :y2="entry.end.y"
              stroke="transparent"
              stroke-width="12"
              vector-effect="non-scaling-stroke"
              :data-entity-id="entry.line.id"
              data-kind="line"
            />
          </template>

          <path
            v-for="entry in curves"
            :key="entry.curve.id"
            :d="entry.d"
            fill="none"
            :class="entityClass(entry.curve)"
            :stroke-dasharray="entry.curve.construction ? '4 4' : undefined"
            :stroke-width="lineWidth(entry.curve.id)"
            stroke="currentColor"
            vector-effect="non-scaling-stroke"
            :data-entity-id="entry.curve.id"
            data-kind="curve"
          />
        </g>

        <g v-if="pendingLineStart !== null" class="pointer-events-none" aria-hidden="true">
          <line
            v-if="linePreview !== null"
            :x1="pendingLineStart.x"
            :y1="pendingLineStart.y"
            :x2="linePreview.x"
            :y2="linePreview.y"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="4 4"
            vector-effect="non-scaling-stroke"
            class="text-muted-foreground"
            data-testid="line-preview"
          />
          <circle
            v-if="lineStart?.kind === 'new'"
            :cx="pendingLineStart.x"
            :cy="pendingLineStart.y"
            r="4"
            class="fill-accent stroke-accent-foreground"
            stroke-width="1"
            data-testid="line-pending-point"
          />
        </g>

        <g v-for="point in points" :key="point.id">
          <circle
            :cx="point.x"
            :cy="point.y"
            r="4"
            stroke-width="1"
            :class="pointClass(point)"
            :data-entity-id="point.id"
            data-kind="point"
          />
          <circle
            v-if="selectedIds.has(point.id)"
            :cx="point.x"
            :cy="point.y"
            r="7"
            class="fill-none stroke-primary"
            stroke-width="1.5"
            data-testid="selection-handle"
          />
        </g>

        <g
          v-for="drawing in dimensionDrawings"
          :key="drawing.id"
          class="pointer-events-none"
          :data-testid="`dimension-lines-${drawing.id}`"
          :data-dimension-id="drawing.id"
        >
          <line
            v-for="segment in drawing.segments"
            :key="segment.key"
            :x1="segment.x1"
            :y1="segment.y1"
            :x2="segment.x2"
            :y2="segment.y2"
            :class="
              drawing.preview
                ? 'stroke-primary'
                : segment.main
                  ? 'stroke-foreground'
                  : 'stroke-muted-foreground'
            "
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <line
            v-if="drawing.draggable"
            :x1="drawing.layout.dimensionStart.x"
            :y1="drawing.layout.dimensionStart.y"
            :x2="drawing.layout.dimensionEnd.x"
            :y2="drawing.layout.dimensionEnd.y"
            stroke="transparent"
            stroke-width="24"
            vector-effect="non-scaling-stroke"
            class="pointer-events-auto cursor-move"
            :data-testid="`dimension-drag-${drawing.id}`"
            @pointerdown.stop="beginDimensionDrag(drawing.constraint, $event)"
          />
        </g>
      </g>

      <g class="pointer-events-none" data-testid="dimension-labels-layer">
        <g
          v-for="label in dimensionLabels"
          :key="label.id"
          :class="
            label.draggable
              ? 'pointer-events-auto cursor-move'
              : label.editable
                ? 'pointer-events-auto cursor-text'
                : 'pointer-events-none'
          "
          :data-dimension-id="label.id"
          :data-testid="`dimension-label-${label.id}`"
          :transform="`translate(${label.x} ${label.y}) rotate(${label.angle})`"
          role="img"
          :aria-label="label.accessibleName"
          @pointerdown.stop="
            label.draggable ? beginDimensionDrag(label.constraint, $event) : undefined
          "
          @dblclick.stop.prevent="onDimensionDoubleClick(label)"
        >
          <title>
            {{
              label.draggable
                ? 'Drag to reposition, double-click to edit'
                : label.editable
                  ? 'Double-click to edit'
                  : 'Dimension preview'
            }}
          </title>
          <rect
            :x="-label.width / 2"
            y="-8"
            :width="label.width"
            height="16"
            rx="2"
            class="fill-background"
          />
          <text
            v-if="label.state === 'broken'"
            :x="-label.width / 2 - 6"
            y="1"
            text-anchor="end"
            dominant-baseline="middle"
            class="fill-destructive text-[11px]"
            data-testid="dimension-broken-glyph"
            aria-hidden="true"
          >
            ⚠
          </text>
          <text
            text-anchor="middle"
            dominant-baseline="middle"
            :class="[labelClass(label), 'text-[11px]']"
            :data-dimension-state="label.state"
          >
            {{ label.value }}
          </text>
        </g>
      </g>

      <g class="pointer-events-none" data-testid="constraints-layer">
        <g
          v-for="marker in constraintLayer"
          :key="marker.id"
          class="pointer-events-auto"
          :data-constraint-id="marker.id"
          :data-constraint-type="marker.type"
          :transform="`translate(${marker.x} ${marker.y})`"
          role="img"
          :aria-label="marker.label"
        >
          <title>{{ marker.label }}</title>
          <circle r="9" class="fill-background stroke-muted-foreground" stroke-width="1" />
          <g transform="translate(-6 -6)">
            <path
              v-for="(d, index) in CONSTRAINT_ICONS[marker.type].paths"
              :key="index"
              :d="d"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="text-foreground"
            />
            <circle
              v-for="(dot, index) in CONSTRAINT_ICONS[marker.type].dots"
              :key="`dot-${index}`"
              :cx="dot.cx"
              :cy="dot.cy"
              :r="dot.r"
              class="fill-foreground"
            />
          </g>
        </g>
      </g>

      <g class="pointer-events-none">
        <rect
          x="0"
          y="0"
          :width="size.width"
          height="16"
          class="fill-background/90"
          data-testid="ruler-x"
        />
        <rect
          x="0"
          y="0"
          width="16"
          :height="size.height"
          class="fill-background/90"
          data-testid="ruler-y"
        />

        <g v-for="tick in xTicks" :key="`x-${tick}`">
          <line
            :x1="xTickPosition(tick)"
            :x2="xTickPosition(tick)"
            y1="12"
            y2="16"
            class="stroke-border"
            vector-effect="non-scaling-stroke"
          />
          <text :x="xTickPosition(tick) + 3" y="11" class="fill-muted-foreground text-[8px]">
            {{ tick }}
          </text>
        </g>

        <g v-for="tick in yTicks" :key="`y-${tick}`">
          <line
            x1="12"
            x2="16"
            :y1="yTickPosition(tick)"
            :y2="yTickPosition(tick)"
            class="stroke-border"
            vector-effect="non-scaling-stroke"
          />
        </g>
      </g>

      <g v-if="marqueeRect !== null" class="pointer-events-none" data-testid="selection-marquee">
        <rect
          :x="marqueeRect.x"
          :y="marqueeRect.y"
          :width="marqueeRect.width"
          :height="marqueeRect.height"
          fill="currentColor"
          fill-opacity="0.1"
          stroke="currentColor"
          stroke-width="1"
          stroke-dasharray="4 4"
          vector-effect="non-scaling-stroke"
          class="text-primary"
        />
      </g>
    </svg>

    <input
      v-if="dimensionEditor !== null"
      ref="dimensionInput"
      :value="dimensionEditor.value"
      type="text"
      inputmode="decimal"
      class="absolute z-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background px-1 py-0.5 text-center text-xs shadow-sm"
      :style="{ left: `${dimensionEditor.x}px`, top: `${dimensionEditor.y}px` }"
      data-testid="dimension-editor"
      :aria-label="`Dimension ${dimensionEditor.id} value`"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="dimensionPicker !== null"
      :aria-controls="dimensionPicker === null ? undefined : 'dimension-reference-list'"
      :aria-activedescendant="pickerActiveDescendant"
      @input="onDimensionEditInput"
      @keydown="onDimensionEditorKeydown"
      @blur="finishDimensionEdit"
    />

    <DimensionReferencePicker
      v-if="dimensionPicker !== null && dimensionEditor !== null"
      list-id="dimension-reference-list"
      class="left-0 top-0"
      :style="{ left: `${dimensionEditor.x}px`, top: `${dimensionEditor.y + 18}px` }"
      :options="dimensionPickerOptions"
      :active-index="pickerActiveIndex"
      @select="selectReference"
    />

    <SeamWidthEditor
      v-if="editingSeam !== null"
      :width="editingSeam.width"
      :x="editingSeam.x"
      :y="editingSeam.y"
      @commit="commitSeamWidth"
      @cancel="editingSeam = null"
    />
  </div>
</template>
