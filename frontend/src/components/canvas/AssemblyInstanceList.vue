<script setup lang="ts">
import {
  instanceEdgeSegments,
  instanceLoops,
  roundToThousandth,
  type AssemblyInstance,
  type EntityId,
  type NotchGeometry,
  type PatternDocument,
  type Piece,
  type Vec2,
} from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import type { SeamDraftSide } from '@/lib/seam-picks';
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
    /** Seam, finished and unmatched edge overlays. */
    showSeams?: boolean;
    /** Sew mode: edge picking replaces instance dragging. */
    sewActive?: boolean;
    /** The sides picked so far, highlighted while the gesture runs. */
    draftSides?: SeamDraftSide[];
    /** The seam sides and finished edges already claimed. */
    seams?: { sides: { instance: EntityId; edges: EntityId[] }[] }[];
    finishedEdges?: { instance: EntityId; edge: EntityId }[];
    /** A stroke width that keeps the hit target at a similar screen size. */
    edgeHitWidth?: number;
    /** The viewport's mm-per-pixel factor, for drag distances. */
    unitPerPixel: () => number;
    /** The world point under a pointer, or null before the canvas has a size. */
    pointerWorld: (event: { clientX: number; clientY: number }) => Vec2 | null;
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
    showSeams: true,
    sewActive: false,
    draftSides: () => [],
    seams: () => [],
    finishedEdges: () => [],
    edgeHitWidth: 0.6,
  },
);

const emit = defineEmits<{
  select: [id: EntityId | null];
  move: [id: EntityId, x: number, y: number];
  nudge: [id: EntityId, dx: number, dy: number];
  remove: [id: EntityId];
  'pick-edge': [instance: EntityId, edge: EntityId];
  'hover-edge': [instance: EntityId | null, edge: EntityId | null];
}>();

const drag = ref<{ id: EntityId; x: number; y: number; dx: number; dy: number } | null>(null);

/** The palette position of a piece, used to name unnamed pieces. */
function pieceIndex(id: EntityId): number {
  return props.pieces.findIndex((candidate) => candidate.id === id);
}

function pieceOf(instance: { piece: EntityId }): Piece | undefined {
  return props.document.pieces.find((piece) => piece.id === instance.piece);
}

/** Sew mode owns the pointer, so instance drags and nudges stay out of the way. */
const interactionsDisabled = computed(() => props.readOnly || props.sewActive);

/** The stored edge id at one authored loop index; the segment list is aligned. */
function edgeAt(instance: AssemblyInstance, index: number): EntityId {
  return pieceOf(instance)!.edges[index]!;
}

/** One stitch polyline per authored loop edge, in assembly space, per instance. */
const edgesByInstance = computed(() => {
  const map = new Map<EntityId, Vec2[][]>();
  for (const instance of props.instances) {
    const piece = pieceOf(instance);
    const segments =
      piece === undefined ? null : instanceEdgeSegments(props.document, piece, instance);
    if (segments !== null) map.set(instance.id, segments);
  }
  return map;
});

const pickedKeys = computed(() => {
  const keys = new Set<string>();
  for (const side of props.draftSides) {
    for (const edge of side.edges) keys.add(`${side.instance}:${edge}`);
  }
  return keys;
});

const claims = computed(() => {
  const sewn = new Set<string>();
  const finished = new Set<string>();
  for (const seam of props.seams) {
    for (const side of seam.sides) {
      for (const edge of side.edges) sewn.add(`${side.instance}:${edge}`);
    }
  }
  for (const edge of props.finishedEdges) finished.add(`${edge.instance}:${edge.edge}`);
  return { sewn, finished };
});

/** The overlay class for one edge: picked, sewn, finished or unmatched. */
function edgeClass(instance: EntityId, edge: EntityId): string {
  const key = `${instance}:${edge}`;
  if (pickedKeys.value.has(key) || claims.value.sewn.has(key)) return 'stroke-primary';
  if (claims.value.finished.has(key)) return 'stroke-muted-foreground';
  return 'stroke-destructive';
}

/** Finished edges are dotted and unmatched ones dashed; sewn edges are solid. */
function edgeDash(instance: EntityId, edge: EntityId): string | undefined {
  const key = `${instance}:${edge}`;
  if (pickedKeys.value.has(key) || claims.value.sewn.has(key)) return undefined;
  return claims.value.finished.has(key) ? '1.4 1.4' : '3 1.6';
}

function openPath(points: readonly Vec2[]): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${roundToThousandth(point.x)} ${roundToThousandth(point.y)}`,
    )
    .join(' ');
}

function lengthOf(points: readonly Vec2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.y - points[index - 1]!.y,
    );
  }
  return total;
}

const hovered = ref<{
  instance: EntityId;
  edge: EntityId;
  x: number;
  y: number;
  length: number;
} | null>(null);

/** Hovering a stitch edge in Sew mode shows its length beside the cursor. */
function onEdgeMove(
  instance: EntityId,
  edge: EntityId,
  points: readonly Vec2[],
  event: PointerEvent,
): void {
  const world = props.pointerWorld(event);
  if (world === null) return;
  hovered.value = { instance, edge, x: world.x, y: world.y, length: lengthOf(points) };
  emit('hover-edge', instance, edge);
}

function onEdgeLeave(): void {
  if (hovered.value === null) return;
  hovered.value = null;
  emit('hover-edge', null, null);
}

function onEdgePick(instance: EntityId, edge: EntityId): void {
  if (!props.sewActive || props.readOnly) return;
  emit('pick-edge', instance, edge);
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
  if (interactionsDisabled.value) return;
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
  if (current === null || interactionsDisabled.value) return;
  if (current.dx === 0 && current.dy === 0) return;
  emit(
    'move',
    instance.id,
    roundToThousandth(instance.x + current.dx),
    roundToThousandth(instance.y + current.dy),
  );
}

function onKeydown(instance: { id: EntityId }, event: KeyboardEvent): void {
  if (interactionsDisabled.value) return;
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
        <g v-if="showSeams" data-testid="instance-seam-overlay">
          <path
            v-for="(points, index) in edgesByInstance.get(instance.id) ?? []"
            :key="`seam-${index}`"
            :d="openPath(points)"
            fill="none"
            :class="edgeClass(instance.id, edgeAt(instance, index))"
            :stroke-dasharray="edgeDash(instance.id, edgeAt(instance, index))"
            stroke-width="0.7"
            stroke-linecap="round"
            data-testid="instance-seam-edge"
          />
        </g>
        <rect
          v-if="selectedInstanceId === instance.id"
          v-bind="selectionBox(instance)"
          fill="none"
          stroke="currentColor"
          stroke-width="0.5"
          stroke-dasharray="3 2"
          data-testid="instance-selection-box"
        />
        <template v-if="sewActive">
          <path
            v-for="(points, index) in edgesByInstance.get(instance.id) ?? []"
            :key="`hit-${index}`"
            :d="openPath(points)"
            fill="none"
            stroke="transparent"
            :stroke-width="edgeHitWidth"
            stroke-linecap="round"
            pointer-events="stroke"
            class="cursor-crosshair"
            :data-testid="`seam-hit-${instance.id}-${edgeAt(instance, index)}`"
            @pointerdown.left.stop.prevent="onEdgePick(instance.id, edgeAt(instance, index))"
            @pointermove.stop="onEdgeMove(instance.id, edgeAt(instance, index), points, $event)"
            @pointerleave.stop="onEdgeLeave"
          />
        </template>
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

    <text
      v-if="hovered"
      :x="hovered.x + 4"
      :y="hovered.y - 4"
      class="fill-current text-[5px]"
      pointer-events="none"
      data-testid="seam-hover-length"
    >
      {{ roundToThousandth(hovered.length) }} mm
    </text>
  </g>
</template>
