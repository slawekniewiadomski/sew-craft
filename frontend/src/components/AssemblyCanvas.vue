<script setup lang="ts">
import {
  assemblyBounds,
  instanceLoops,
  type Assembly,
  type AssemblyInstance,
  type EntityId,
  type PatternDocument,
  type Piece,
} from '@sewcraft/geometry';
import { computed, ref, watch } from 'vue';

import { Button } from '@/components/ui/button';
import { tabColor } from '@/lib/tabs';

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    assemblyId: EntityId;
    selectedInstanceId?: EntityId | null;
    /** Whether the Add piece picker is open (the ribbon toggles it). */
    pickerOpen?: boolean;
    /** Bumped by the Fit action and by activating the tab. */
    fitToken?: number;
    readOnly?: boolean;
  }>(),
  { selectedInstanceId: null, pickerOpen: false, fitToken: 0, readOnly: false },
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
const drag = ref<{ x: number; y: number; dx: number; dy: number } | null>(null);

const assembly = computed<Assembly | null>(
  () => props.document.assemblies.find((candidate) => candidate.id === props.assemblyId) ?? null,
);

/** Every piece the picker offers, in document order. */
const pieces = computed(() => props.document.pieces);

const padding = 20;

const box = computed(() => {
  const bounds = assembly.value === null ? null : assemblyBounds(props.document, assembly.value);
  if (bounds === null) return { minX: 0, minY: 0, width: 100, height: 100 };
  return {
    minX: bounds.min.x - padding,
    minY: bounds.min.y - padding,
    width: bounds.max.x - bounds.min.x + padding * 2,
    height: bounds.max.y - bounds.min.y + padding * 2,
  };
});

const viewBox = computed(
  () => `${box.value.minX} ${box.value.minY} ${box.value.width} ${box.value.height}`,
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
  const index = props.document.pieces.findIndex((candidate) => candidate.id === instance.piece);
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

/** The mm-per-pixel factor of the current fitted viewBox. */
function unitPerPixel(): number {
  const element = svg.value;
  /* v8 ignore next -- the SVG exists for every pointer event */
  if (element === null || element.clientWidth === 0) return 1;
  return box.value.width / element.clientWidth;
}

function onPointerDown(
  instance: { id: EntityId; x: number; y: number },
  event: PointerEvent,
): void {
  select(instance.id);
  if (props.readOnly) return;
  drag.value = { x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
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

/** Drag preview offset for the active instance, in millimetres. */
function previewOffset(instance: { id: EntityId }): string {
  const current = drag.value;
  if (current === null) return '';
  return `translate(${round(current.dx)} ${round(current.dy)})`;
}

watch(
  () => [props.assemblyId, props.fitToken],
  () => {
    drag.value = null;
  },
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
      @pointerdown.self="emit('select', null)"
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
        @pointerdown.stop="onPointerDown(instance, $event)"
        @pointermove="onPointerMove(instance, $event)"
        @pointerup="onPointerUp(instance)"
        @pointercancel="drag = null"
        @keydown="onKeydown(instance, $event)"
      >
        <template v-if="loopsFor(instance) !== null">
          <template v-if="loopsFor(instance)!.cut.length > 0">
            <path
              :d="pathOf(loopsFor(instance)!.cut)"
              :fill="fillOf(instance)"
              :fill-opacity="0.18"
              stroke="none"
              data-testid="instance-cut-fill"
            />
            <path
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
              :d="pathOf(loopsFor(instance)!.stitch)"
              fill="none"
              stroke="currentColor"
              stroke-width="0.35"
              stroke-dasharray="4 2"
              data-testid="instance-stitch-line"
            />
            <path
              v-for="(fold, index) in loopsFor(instance)!.folds"
              :key="index"
              :d="pathOf(fold)"
              fill="none"
              stroke="currentColor"
              stroke-width="0.35"
              stroke-dasharray="6 3"
              data-testid="instance-fold-line"
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
        {{ piece.name?.trim() || `Piece ${props.document.pieces.indexOf(piece) + 1}` }}
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
