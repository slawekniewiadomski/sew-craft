<script setup lang="ts">
import {
  allPoints,
  bounds,
  type CurveEntity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
  seamAllowancePaths,
  type Vec2,
} from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { curvePath, polylinePath } from '@/lib/canvas-render';
import { CONSTRAINT_ICONS, constraintMarkers, type ConstraintMarker } from '@/lib/constraint-view';
import type { EditorTool } from '@/lib/editor-tools';
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
  edge: EntityId;
  d: string;
  selfIntersects: boolean;
}

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    tool: EditorTool;
    selectedId?: EntityId | null;
    fitToken?: number;
    showSeamAllowance?: boolean;
    showConstraints?: boolean;
  }>(),
  { selectedId: null, fitToken: 0, showSeamAllowance: true, showConstraints: false },
);

const emit = defineEmits<{
  'update:selectedId': [id: EntityId | null];
  'move-point': [id: EntityId, x: number, y: number];
  'add-point': [x: number, y: number];
  'add-line': [start: EntityId, end: EntityId];
  'add-curve': [points: [EntityId, EntityId, EntityId, EntityId]];
}>();

const svg = ref<SVGSVGElement | null>(null);
const viewport = ref<Viewport>({ x: -40, y: -40, scale: 1 });
const size = ref<Size>({ width: 800, height: 600 });
let resizeObserver: ResizeObserver | null = null;
const dragState = ref<{ id: EntityId; x: number; y: number; origin: Vec2 } | null>(null);
const panState = ref<{ start: Vec2; origin: Viewport } | null>(null);
const pending = ref<EntityId[]>([]);
const spaceHeld = ref(false);

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
  return seamAllowancePaths(props.document).map((allowance) => ({
    edge: allowance.edge,
    d: polylinePath(allowance.path),
    selfIntersects: allowance.selfIntersections.length > 0,
  }));
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
    const cell = `${Math.round(screen.x / CONSTRAINT_ICON_STEP)}:${Math.round(screen.y / CONSTRAINT_ICON_STEP)}`;
    const index = stacks.get(cell) ?? 0;
    stacks.set(cell, index + 1);

    return {
      ...marker,
      x: screen.x + CONSTRAINT_ICON_SIZE / 2 + index * CONSTRAINT_ICON_STEP,
      y: screen.y - CONSTRAINT_ICON_SIZE / 2,
    };
  });
});

const pendingIds = computed(() => new Set(pending.value));
const gridStep = computed(() => niceStep(viewport.value.scale));
const gridPath = computed(() => `M ${gridStep.value} 0 L 0 0 0 ${gridStep.value}`);
const transform = computed(() => viewportTransform(viewport.value));
const visible = computed(() => visibleWorldRect(viewport.value, size.value));
const xTicks = computed(() => ticksAlong(visible.value, 'x', gridStep.value));
const yTicks = computed(() => ticksAlong(visible.value, 'y', gridStep.value));
const cursorClass = computed(() =>
  props.tool === 'select' ? 'cursor-default' : 'cursor-crosshair',
);

function xTickPosition(value: number): number {
  return worldToScreen(viewport.value, { x: value, y: 0 }).x;
}

function yTickPosition(value: number): number {
  return worldToScreen(viewport.value, { x: 0, y: value }).y;
}

function pointClass(point: PointEntity): string {
  if (point.id === props.selectedId) return 'fill-primary stroke-primary-foreground';
  if (pendingIds.value.has(point.id)) return 'fill-accent stroke-accent-foreground';
  return point.construction ? 'fill-muted-foreground' : 'fill-foreground';
}

function entityClass(entity: { id: EntityId; construction: boolean }): string {
  if (entity.id === props.selectedId) return 'text-primary';
  return entity.construction ? 'text-muted-foreground' : 'text-foreground';
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

function onPointerDown(event: PointerEvent): void {
  updateSize();
  const screen = screenPoint(event);

  if (event.button === 1 || spaceHeld.value) {
    beginPan(screen);
    return;
  }

  const hit = hitEntity(event);
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
      selectPendingPoint(hit, 2);
      break;
    case 'add_curve':
      selectPendingPoint(hit, 4);
      break;
  }
}

function onPointerMove(event: PointerEvent): void {
  const screen = screenPoint(event);

  if (panState.value) {
    const dx = screen.x - panState.value.start.x;
    const dy = screen.y - panState.value.start.y;
    viewport.value = panBy(panState.value.origin, dx, dy);
  } else if (dragState.value) {
    const world = snapToGrid(screenToWorld(viewport.value, screen));
    dragState.value = { ...dragState.value, x: world.x, y: world.y };
  }
}

function onPointerUp(): void {
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
  if (ids.length === 2) {
    emit('add-line', ids[0]!, ids[1]!);
  } else {
    emit('add-curve', [ids[0]!, ids[1]!, ids[2]!, ids[3]!]);
  }
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
}

function removePointerListeners(): void {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
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
  },
);
</script>

<template>
  <div
    class="h-full min-h-0 w-full overflow-hidden rounded-md border bg-muted/30"
    :class="cursorClass"
  >
    <svg
      ref="svg"
      class="block h-full w-full touch-none select-none"
      role="img"
      aria-label="Pattern canvas"
      @pointerdown="onPointerDown"
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

        <g>
          <template v-for="entry in lines" :key="entry.line.id">
            <line
              :x1="entry.start.x"
              :y1="entry.start.y"
              :x2="entry.end.x"
              :y2="entry.end.y"
              :class="entityClass(entry.line)"
              :stroke-dasharray="entry.line.construction ? '4 4' : undefined"
              :stroke-width="entry.line.id === selectedId ? 3 : 2"
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
  </div>
</template>
