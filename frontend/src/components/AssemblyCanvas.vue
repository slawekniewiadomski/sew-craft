<script setup lang="ts">
import {
  assemblyBounds,
  instanceLoops,
  type Assembly,
  type AssemblyInstance,
  type EntityId,
  type NotchGeometry,
  type PatternDocument,
  type Piece,
  type Vec2,
} from '@sewcraft/geometry';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Button } from '@/components/ui/button';
import { tabColor } from '@/lib/tabs';

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    assemblyId: EntityId;
    selectedInstanceId?: EntityId | null;
    /** Whether the Add piece picker is open (the ribbon toggles it). */
    pickerOpen?: boolean;
    /**
     * Every piece the Add piece picker offers. The canvas document is the
     * assembly slice and only holds pieces an instance already places, so the
     * picker is fed the pattern's full piece list instead.
     */
    pieces?: Piece[];
    /** Bumped by the Fit action and by activating the tab. */
    fitToken?: number;
    readOnly?: boolean;
    /** Layer visibility; every layer is drawn unless the display menu hides it. */
    showCutShapes?: boolean;
    showAllowances?: boolean;
    showStitch?: boolean;
    showFolds?: boolean;
    showLabels?: boolean;
    /** Notch marks, which sit in the allowance and follow the instance transform. */
    showNotches?: boolean;
  }>(),
  {
    selectedInstanceId: null,
    pickerOpen: false,
    fitToken: 0,
    readOnly: false,
    showCutShapes: true,
    showAllowances: true,
    showStitch: true,
    showFolds: true,
    showLabels: true,
    showNotches: true,
  },
);

const emit = defineEmits<{
  select: [instance: EntityId | null];
  move: [instance: EntityId, x: number, y: number];
  nudge: [instance: EntityId, dx: number, dy: number];
  remove: [instance: EntityId];
  'add-piece': [piece: EntityId];
  'close-picker': [];
}>();

const svg = ref<SVGSVGElement | null>(null);
const drag = ref<{ id: EntityId; x: number; y: number; dx: number; dy: number } | null>(null);

const assembly = computed<Assembly | null>(
  () => props.document.assemblies.find((candidate) => candidate.id === props.assemblyId) ?? null,
);

/** Every piece the picker offers, in document order. */
const pieces = computed(() => props.pieces ?? props.document.pieces);

/** The palette position of a piece, used to name unnamed pieces. */
function pieceIndex(id: EntityId): number {
  return pieces.value.findIndex((candidate) => candidate.id === id);
}

const padding = 20;
/** How far the wheel may magnify or shrink the fitted view. */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 40;

interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The fitted world rectangle: the assembly plus its padding, snapshotted on fit. */
const fitBox = ref<ViewRect>({ x: 0, y: 0, width: 100, height: 100 });

/** The assembled bounds plus padding; never applied while the maker is working. */
function fittedBox(): ViewRect {
  const bounds = assembly.value === null ? null : assemblyBounds(props.document, assembly.value);
  if (bounds === null) return { x: 0, y: 0, width: 100, height: 100 };
  return {
    x: bounds.min.x - padding,
    y: bounds.min.y - padding,
    width: bounds.max.x - bounds.min.x + padding * 2,
    height: bounds.max.y - bounds.min.y + padding * 2,
  };
}

/** The zoomed view's centre in world space; `null` while fitted. */
const centre = ref<Vec2 | null>(null);
/** Zoom relative to the fitted view; 1 is fit, larger magnifies. */
const zoom = ref(1);

/** The world rectangle the SVG shows. */
const view = computed(() => {
  const base = fitBox.value;
  /* v8 ignore next -- a fitted view is the only alternative to a centred one */
  if (centre.value === null) return base;
  const width = base.width / zoom.value;
  const height = base.height / zoom.value;
  return {
    x: centre.value.x - width / 2,
    y: centre.value.y - height / 2,
    width,
    height,
  };
});

const viewBox = computed(
  () => `${view.value.x} ${view.value.y} ${view.value.width} ${view.value.height}`,
);

function pieceOf(instance: { piece: EntityId }): Piece | undefined {
  return props.document.pieces.find((piece) => piece.id === instance.piece);
}

/** The rendered loops of one instance, or `null` for a piece with no anchor. */
function loopsFor(instance: AssemblyInstance) {
  const piece = pieceOf(instance);
  return piece === undefined ? null : instanceLoops(props.document, piece, instance);
}

function pathOf(points: { x: number; y: number }[]): string {
  /* v8 ignore next -- callers only pass a resolved loop or fold */
  if (points.length === 0) return '';
  return `${points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`).join(' ')} Z`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The open V a notch draws: foot → tip → foot. */
function notchPath(notch: NotchGeometry): string {
  return `M ${round(notch.feet[0].x)} ${round(notch.feet[0].y)} L ${round(notch.tip.x)} ${round(notch.tip.y)} L ${round(notch.feet[1].x)} ${round(notch.feet[1].y)}`;
}

function fillOf(instance: { piece: EntityId }): string {
  const piece = pieceOf(instance);
  return (
    /* v8 ignore next -- tabColor reads the same stored colour */
    (piece === undefined ? null : (piece.color ?? null)) ??
    tabColor(props.document, { kind: 'piece', id: instance.piece }) ??
    '#94a3b8'
  );
}

function labelOf(instance: { piece: EntityId; mirrored?: boolean }): string {
  const piece = pieceOf(instance);
  const index = pieceIndex(instance.piece);
  const name = piece?.name?.trim() || (index < 0 ? 'Piece' : `Piece ${index + 1}`);
  return instance.mirrored === true ? `${name} · mirrored` : name;
}

function labelPosition(instance: { id: EntityId; piece: EntityId; x: number; y: number }) {
  const loops = loopsFor(instance);
  if (loops === null || loops.cut.length === 0) return { x: instance.x, y: instance.y + 20 };
  const minY = Math.min(...loops.cut.map((point) => point.y));
  return { x: instance.x, y: minY - 4 };
}

function selectionBox(instance: { id: EntityId; piece: EntityId; x: number; y: number }) {
  const loops = loopsFor(instance);
  /* v8 ignore next -- the box renders only inside the cut branch */
  if (loops === null || loops.cut.length === 0) return {};
  const xs = loops.cut.map((point) => point.x);
  const ys = loops.cut.map((point) => point.y);
  return {
    x: Math.min(...xs) - 2,
    y: Math.min(...ys) - 2,
    width: Math.max(...xs) - Math.min(...xs) + 4,
    height: Math.max(...ys) - Math.min(...ys) + 4,
  };
}

function select(instance: EntityId): void {
  emit('select', instance);
}

/** The mm-per-pixel factor of the current viewBox. */
function unitPerPixel(): number {
  const element = svg.value;
  /* v8 ignore next -- the SVG exists for every pointer event */
  if (element === null || element.clientWidth === 0) return 1;
  return view.value.width / element.clientWidth;
}

/** Screen pixels per world millimetre; `null` before the canvas has a size. */
function pixelsPerMillimetre(): number | null {
  const element = svg.value;
  /* v8 ignore next -- the SVG exists for every pointer event */
  if (element === null || element.clientWidth === 0) return null;
  return element.clientWidth / view.value.width;
}

/** The world point under a pointer, or `null` before the canvas has a size. */
function pointerWorld(pointer: { clientX: number; clientY: number }): Vec2 | null {
  const element = svg.value;
  const scale = pixelsPerMillimetre();
  /* v8 ignore next -- the SVG exists for every pointer event */
  if (element === null || scale === null) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: view.value.x + (pointer.clientX - rect.left) / scale,
    y: view.value.y + (pointer.clientY - rect.top) / scale,
  };
}

/** Wheel zoom keeps the world point under the pointer fixed. */
function onWheel(event: WheelEvent): void {
  const world = pointerWorld(event);
  if (world === null) return;
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value * factor));
  const ratio = next / zoom.value;
  const current = view.value;
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;
  centre.value = {
    x: world.x + (cx - world.x) / ratio,
    y: world.y + (cy - world.y) / ratio,
  };
  zoom.value = next;
}

/** A middle-button pan: its screen origin, the view centre and the mm-per-pixel. */
const pan = ref<{ clientX: number; clientY: number; centre: Vec2; scale: number } | null>(null);

function onCanvasPointerDown(event: PointerEvent): void {
  if (event.button === 1) {
    event.preventDefault();
    beginPan(event);
    return;
  }
  if (event.button === 0) emit('select', null);
}

function beginPan(event: PointerEvent): void {
  const scale = pixelsPerMillimetre();
  if (scale === null) return;
  const current = view.value;
  pan.value = {
    clientX: event.clientX,
    clientY: event.clientY,
    centre: { x: current.x + current.width / 2, y: current.y + current.height / 2 },
    scale,
  };
  (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', onPanMove);
  window.addEventListener('pointerup', endPan);
  window.addEventListener('pointercancel', endPan);
}

function onPanMove(event: PointerEvent): void {
  const current = pan.value!;
  centre.value = {
    x: current.centre.x - (event.clientX - current.clientX) / current.scale,
    y: current.centre.y - (event.clientY - current.clientY) / current.scale,
  };
}

function endPan(): void {
  pan.value = null;
  window.removeEventListener('pointermove', onPanMove);
  window.removeEventListener('pointerup', endPan);
  window.removeEventListener('pointercancel', endPan);
}

onBeforeUnmount(endPan);

function onPointerDown(
  instance: { id: EntityId; x: number; y: number },
  event: PointerEvent,
): void {
  select(instance.id);
  if (props.readOnly) return;
  drag.value = { id: instance.id, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
  (event.target as Element).setPointerCapture?.(event.pointerId);
}

function onPointerMove(
  instance: { id: EntityId; x: number; y: number },
  event: PointerEvent,
): void {
  const current = drag.value;
  if (current === null) return;
  const scale = unitPerPixel();
  current.dx = (event.clientX - current.x) * scale;
  current.dy = (event.clientY - current.y) * scale;
}

function onPointerUp(instance: { id: EntityId; x: number; y: number }): void {
  const current = drag.value;
  drag.value = null;
  if (current === null || props.readOnly) return;
  if (current.dx === 0 && current.dy === 0) return;
  emit('move', instance.id, round(instance.x + current.dx), round(instance.y + current.dy));
}

function onKeydown(instance: { id: EntityId }, event: KeyboardEvent): void {
  if (props.readOnly) return;
  const step = event.shiftKey ? 10 : 1;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    emit('nudge', instance.id, -step, 0);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    emit('nudge', instance.id, step, 0);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    emit('nudge', instance.id, 0, -step);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    emit('nudge', instance.id, 0, step);
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    emit('remove', instance.id);
  } else if (event.key === 'Escape') {
    drag.value = null;
  }
}

/** Drag preview offset for the pressed instance, in millimetres. */
function previewOffset(instance: { id: EntityId }): string {
  const current = drag.value;
  if (current === null || current.id !== instance.id) return '';
  return `translate(${round(current.dx)} ${round(current.dy)})`;
}

/** Fit on mount, tab change or the Fit action — never on a document edit. */
watch(
  () => [props.assemblyId, props.fitToken],
  () => {
    drag.value = null;
    centre.value = null;
    zoom.value = 1;
    fitBox.value = fittedBox();
  },
  { immediate: true },
);
</script>

<template>
  <div class="relative h-full min-h-0" data-testid="assembly-canvas">
    <svg
      ref="svg"
      class="h-full w-full"
      :viewBox="viewBox"
      role="application"
      :aria-label="`Assembly ${props.assemblyId}`"
      data-testid="assembly-svg"
      @pointerdown="onCanvasPointerDown"
      @mousedown.middle.prevent
      @wheel.prevent="onWheel"
    >
      <g
        v-for="instance in assembly?.instances ?? []"
        :key="instance.id"
        :transform="previewOffset(instance)"
        :data-testid="`assembly-instance-${instance.id}`"
        :data-selected="props.selectedInstanceId === instance.id ? 'true' : 'false'"
        role="button"
        tabindex="0"
        :aria-label="labelOf(instance)"
        @pointerdown.left.stop="onPointerDown(instance, $event)"
        @pointermove="onPointerMove(instance, $event)"
        @pointerup="onPointerUp(instance)"
        @pointercancel="drag = null"
        @keydown="onKeydown(instance, $event)"
      >
        <template v-if="loopsFor(instance) !== null">
          <template v-if="loopsFor(instance)!.cut.length > 0">
            <path
              v-if="props.showCutShapes"
              :d="pathOf(loopsFor(instance)!.cut)"
              :fill="fillOf(instance)"
              :fill-opacity="0.18"
              stroke="none"
              data-testid="instance-cut-fill"
            />
            <path
              v-if="props.showAllowances"
              :d="`${pathOf(loopsFor(instance)!.cut)} ${pathOf(loopsFor(instance)!.stitch)}`"
              :fill="fillOf(instance)"
              :fill-opacity="0.28"
              fill-rule="evenodd"
              stroke="none"
              data-testid="instance-allowance-band"
            />
            <path
              :d="pathOf(loopsFor(instance)!.cut)"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
              data-testid="instance-cut-line"
            />
            <path
              v-if="props.showStitch"
              :d="pathOf(loopsFor(instance)!.stitch)"
              fill="none"
              stroke="currentColor"
              stroke-width="0.35"
              stroke-dasharray="4 2"
              data-testid="instance-stitch-line"
            />
            <path
              v-for="(fold, index) in props.showFolds ? loopsFor(instance)!.folds : []"
              :key="index"
              :d="pathOf(fold)"
              fill="none"
              stroke="currentColor"
              stroke-width="0.35"
              stroke-dasharray="6 3"
              data-testid="instance-fold-line"
            />
            <path
              v-for="(notch, index) in props.showNotches ? loopsFor(instance)!.notches : []"
              :key="index"
              :d="notchPath(notch)"
              fill="none"
              stroke-width="0.5"
              class="stroke-mark"
              data-testid="instance-notch"
            />
            <rect
              v-if="props.selectedInstanceId === instance.id"
              v-bind="selectionBox(instance)"
              fill="none"
              stroke="currentColor"
              stroke-width="0.5"
              stroke-dasharray="3 2"
              data-testid="instance-selection-box"
            />
          </template>
          <g v-else data-testid="instance-placeholder">
            <circle
              :cx="instance.x"
              :cy="instance.y"
              r="6"
              fill="none"
              stroke="currentColor"
              stroke-width="0.5"
              stroke-dasharray="2 2"
            />
          </g>
        </template>
        <g v-else data-testid="instance-placeholder">
          <circle
            :cx="instance.x"
            :cy="instance.y"
            r="6"
            fill="none"
            stroke="currentColor"
            stroke-width="0.5"
            stroke-dasharray="2 2"
          />
        </g>

        <text
          v-if="props.showLabels"
          :x="labelPosition(instance).x"
          :y="labelPosition(instance).y"
          text-anchor="middle"
          class="fill-current text-[4px]"
          :class="
            props.selectedInstanceId === instance.id ? 'text-primary' : 'text-muted-foreground'
          "
          data-testid="instance-label"
        >
          {{ labelOf(instance) }}
        </text>
      </g>
    </svg>

    <p
      v-if="(assembly?.instances.length ?? 0) === 0"
      class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
      data-testid="assembly-empty"
    >
      Add a piece to start
    </p>

    <div
      v-if="props.pickerOpen"
      class="absolute left-2 top-2 z-10 max-h-64 w-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
      role="menu"
      data-testid="add-piece-picker"
    >
      <p v-if="pieces.length === 0" class="px-2 py-1.5 text-xs text-muted-foreground">
        No pieces yet
      </p>
      <button
        v-for="piece in pieces"
        :key="piece.id"
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
        :data-testid="`add-piece-${piece.id}`"
        @click="emit('add-piece', piece.id)"
      >
        <span
          class="size-2 rounded-full border"
          :style="{ backgroundColor: piece.color ?? 'transparent' }"
          aria-hidden="true"
        />
        {{ piece.name?.trim() || `Piece ${pieceIndex(piece.id) + 1}` }}
      </button>
      <Button
        v-if="props.pickerOpen"
        variant="ghost"
        size="sm"
        class="mt-1 w-full justify-start text-xs"
        data-testid="add-piece-close"
        @click="emit('close-picker')"
      >
        Close
      </Button>
    </div>
  </div>
</template>
