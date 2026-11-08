<script setup lang="ts">
import {
  instanceLoops,
  roundToThousandth,
  type AssemblyInstance,
  type EntityId,
  type NotchGeometry,
  type PatternDocument,
  type Piece,
} from '@sewcraft/geometry';
import { ref } from 'vue';

import { tabColor } from '@/lib/tabs';

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    instances: AssemblyInstance[];
    pieces: Piece[];
    selectedInstanceId?: EntityId | null;
    readOnly?: boolean;
    showCutShapes?: boolean;
    showAllowances?: boolean;
    showStitch?: boolean;
    showFolds?: boolean;
    showNotches?: boolean;
    showLabels?: boolean;
    /** The viewport's mm-per-pixel factor, for drag distances. */
    unitPerPixel: () => number;
  }>(),
  {
    selectedInstanceId: null,
    readOnly: false,
    showCutShapes: true,
    showAllowances: true,
    showStitch: true,
    showFolds: true,
    showNotches: true,
    showLabels: true,
  },
);

const emit = defineEmits<{
  select: [id: EntityId | null];
  move: [id: EntityId, x: number, y: number];
  nudge: [id: EntityId, dx: number, dy: number];
  remove: [id: EntityId];
}>();

const drag = ref<{ id: EntityId; x: number; y: number; dx: number; dy: number } | null>(null);

/** The palette position of a piece, used to name unnamed pieces. */
function pieceIndex(id: EntityId): number {
  return props.pieces.findIndex((candidate) => candidate.id === id);
}

function pieceOf(instance: { piece: EntityId }): Piece | undefined {
  return props.document.pieces.find((piece) => piece.id === instance.piece);
}

function loopsFor(instance: AssemblyInstance) {
  const piece = pieceOf(instance);
  return piece === undefined ? null : instanceLoops(props.document, piece, instance);
}

function pathOf(points: { x: number; y: number }[]): string {
  /* v8 ignore next -- callers only pass a resolved loop or fold */
  if (points.length === 0) return '';
  return `${points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${roundToThousandth(point.x)} ${roundToThousandth(point.y)}`).join(' ')} Z`;
}

/** The open V a notch draws: foot → tip → foot. */
function notchPath(notch: NotchGeometry): string {
  return `M ${roundToThousandth(notch.feet[0].x)} ${roundToThousandth(notch.feet[0].y)} L ${roundToThousandth(notch.tip.x)} ${roundToThousandth(notch.tip.y)} L ${roundToThousandth(notch.feet[1].x)} ${roundToThousandth(notch.feet[1].y)}`;
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

function onPointerDown(
  instance: { id: EntityId; x: number; y: number },
  event: PointerEvent,
): void {
  emit('select', instance.id);
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
  const scale = props.unitPerPixel();
  current.dx = (event.clientX - current.x) * scale;
  current.dy = (event.clientY - current.y) * scale;
}

function onPointerUp(instance: { id: EntityId; x: number; y: number }): void {
  const current = drag.value;
  drag.value = null;
  if (current === null || props.readOnly) return;
  if (current.dx === 0 && current.dy === 0) return;
  emit(
    'move',
    instance.id,
    roundToThousandth(instance.x + current.dx),
    roundToThousandth(instance.y + current.dy),
  );
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
  return `translate(${roundToThousandth(current.dx)} ${roundToThousandth(current.dy)})`;
}
</script>

<template>
  <g
    v-for="instance in instances"
    :key="instance.id"
    :transform="previewOffset(instance)"
    :data-testid="`assembly-instance-${instance.id}`"
    :data-selected="selectedInstanceId === instance.id ? 'true' : 'false'"
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
          v-if="showCutShapes"
          :d="pathOf(loopsFor(instance)!.cut)"
          :fill="fillOf(instance)"
          :fill-opacity="0.18"
          stroke="none"
          data-testid="instance-cut-fill"
        />
        <path
          v-if="showAllowances"
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
          v-if="showStitch"
          :d="pathOf(loopsFor(instance)!.stitch)"
          fill="none"
          stroke="currentColor"
          stroke-width="0.35"
          stroke-dasharray="4 2"
          data-testid="instance-stitch-line"
        />
        <path
          v-for="(fold, index) in showFolds ? loopsFor(instance)!.folds : []"
          :key="index"
          :d="pathOf(fold)"
          fill="none"
          stroke="currentColor"
          stroke-width="0.35"
          stroke-dasharray="6 3"
          data-testid="instance-fold-line"
        />
        <path
          v-for="(notch, index) in showNotches ? loopsFor(instance)!.notches : []"
          :key="index"
          :d="notchPath(notch)"
          fill="none"
          stroke-width="0.5"
          class="stroke-mark"
          data-testid="instance-notch"
        />
        <rect
          v-if="selectedInstanceId === instance.id"
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
      v-if="showLabels"
      :x="labelPosition(instance).x"
      :y="labelPosition(instance).y"
      text-anchor="middle"
      class="fill-current text-[4px]"
      :class="selectedInstanceId === instance.id ? 'text-primary' : 'text-muted-foreground'"
      data-testid="instance-label"
    >
      {{ labelOf(instance) }}
    </text>
  </g>
</template>
