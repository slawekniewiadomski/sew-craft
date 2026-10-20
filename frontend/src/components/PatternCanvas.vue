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
  dimensionValue,
  type DistanceConstraint,
  type EntityId,
  inferDimensionOrientation,
  isDrivenDimension,
  type LineEntity,
  measureLinearDimension,
  type PatternDocument,
  type PointEntity,
  seamAllowancePaths,
  seamForEdge,
  type Vec2,
} from '@sewcraft/geometry';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { curvePath, polylinePath } from '@/lib/canvas-render';
import type { ConstraintPick } from '@/lib/constraint-tools';
import { CONSTRAINT_ICONS, constraintMarkers, type ConstraintMarker } from '@/lib/constraint-view';
import {
  dimensionLabelWidth,
  dimensionSegments,
  formatDimensionLabel,
  formatDimensionValue,
  parseDimensionEdit,
  type DimensionEdit,
  type DimensionPatch,
  type DimensionPlacement,
  type DimensionSegment,
} from '@/lib/dimensions';
import type { EditorTool } from '@/lib/editor-tools';
import {
  resolveLineEndpoint,
  sameEndpoint,
  type LineEndpoint,
} from '@/lib/line-tool';
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
  /** Label text, wrapped in parentheses when the dimension is driven. */
  value: string;
  /** The effective number without parentheses, for accessible names. */
  measured: string;
  driven: boolean;
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
  driven: boolean;
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
    selectedId?: EntityId | null;
    fitToken?: number;
    showSeamAllowance?: boolean;
    showConstraints?: boolean;
    showDimensions?: boolean;
    constraintActive?: boolean;
    constraintPicks?: ConstraintPick[];
  }>(),
  {
    selectedId: null,
    fitToken: 0,
    showSeamAllowance: true,
    showConstraints: false,
    showDimensions: true,
    constraintActive: false,
    constraintPicks: () => [],
  },
);

const emit = defineEmits<{
  'update:selectedId': [id: EntityId | null];
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
  const driven = isDrivenDimension(constraint);

  return {
    id: constraint.id,
    constraint,
    layout,
    segments: dimensionSegments(layout),
    value: formatDimensionLabel(value, driven),
    measured: formatDimensionValue(value),
    driven,
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
      driven: drawing.driven,
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

function xTickPosition(value: number): number {
  return worldToScreen(viewport.value, { x: value, y: 0 }).x;
}

function yTickPosition(value: number): number {
  return worldToScreen(viewport.value, { x: 0, y: value }).y;
}

function pointClass(point: PointEntity): string {
  if (pickedPointIds.value.has(point.id)) return 'fill-primary stroke-primary-foreground';
  if (point.id === props.selectedId) return 'fill-primary stroke-primary-foreground';
  if (pendingIds.value.has(point.id) || point.id === pendingLineStartId.value) {
    return 'fill-accent stroke-accent-foreground';
  }
  return point.construction ? 'fill-muted-foreground' : 'fill-foreground';
}

function entityClass(entity: { id: EntityId; construction: boolean }): string {
  if (pickedLineIds.value.has(entity.id) || entity.id === props.selectedId) return 'text-primary';
  return entity.construction ? 'text-muted-foreground' : 'text-foreground';
}

function lineWidth(id: EntityId): number {
  return pickedLineIds.value.has(id) || id === props.selectedId ? 3 : 2;
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

function onDimensionDoubleClick(label: DimensionLabelView): void {
  if (!label.editable) return;
  void beginDimensionEdit(label.constraint);
}

async function beginDimensionEdit(constraint: DistanceConstraint): Promise<void> {
  // The label only renders for a resolvable span, so an effective value exists.
  const value = dimensionValue(props.document, constraint)!;
  editingDimension.value = {
    id: constraint.id,
    value: formatDimensionValue(value),
  };
  await nextTick();
  dimensionInput.value!.focus();
  dimensionInput.value!.select();
}

function onDimensionEditInput(event: Event): void {
  const editing = editingDimension.value!;
  editingDimension.value = {
    id: editing.id,
    value: (event.target as HTMLInputElement).value,
  };
}

/** Enter: apply a set or driven edit, otherwise keep editing to fix the typo. */
function applyDimensionEdit(): void {
  const editing = editingDimension.value!;
  const edit = parseDimensionEdit(editing.value);
  if (edit.kind === 'invalid') return;

  editingDimension.value = null;
  emit('update-dimension', editing.id, dimensionPatchFor(edit));
}

/** Blur: commit a set or driven edit and discard an invalid one. */
function finishDimensionEdit(): void {
  const editing = editingDimension.value!;
  const edit = parseDimensionEdit(editing.value);
  editingDimension.value = null;
  if (edit.kind !== 'invalid') {
    emit('update-dimension', editing.id, dimensionPatchFor(edit));
  }
}

/** Map a parsed edit to the command patch: driven clears the value with `null`. */
function dimensionPatchFor(edit: Exclude<DimensionEdit, { kind: 'invalid' }>): DimensionPatch {
  return edit.kind === 'driven' ? { value: null } : { value: edit.value };
}

function cancelDimensionEdit(): void {
  editingDimension.value = null;
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

  const hit = hitEntity(event);
  if (props.constraintActive) {
    if (hit !== null) {
      emit('constraint-pick', { id: hit.id, kind: hit.kind as ConstraintPick['kind'] });
    }
    return;
  }

  switch (props.tool) {
    case 'select':
      if (hit && hit.kind === 'point') {
        emit('update:selectedId', hit.id);
        beginDrag(hit.id, pointById.value.get(hit.id)!);
      } else {
        emit('update:selectedId', hit ? hit.id : null);
        beginPan(screen);
      }
      break;
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

  if (dimensionDrag.value) {
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
  dimensionDrag.value = null;
  dragState.value = null;
  panState.value = null;
  removePointerListeners();
}

function onPointerCancel(): void {
  cancelPointerInteraction();
}

function onPointerUp(): void {
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
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
  viewport.value = zoomAt(viewport.value, screenPoint(event), factor);
}

function onKeyDown(event: KeyboardEvent): void {
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

onMounted(() => {
  updateSize();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
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
            :stroke-width="entry.curve.id === selectedId ? 3 : 2"
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
            v-if="point.id === selectedId"
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
          :aria-label="
            label.driven
              ? `Driven dimension, measured ${label.measured} millimetres`
              : `Dimension ${label.measured} millimetres`
          "
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
            text-anchor="middle"
            dominant-baseline="middle"
            :class="[
              label.driven && !label.preview ? 'fill-muted-foreground' : 'fill-foreground',
              'text-[11px]',
            ]"
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
      @input="onDimensionEditInput"
      @keydown.enter.prevent.stop="applyDimensionEdit"
      @keydown.esc.prevent.stop="cancelDimensionEdit"
      @blur="finishDimensionEdit"
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
