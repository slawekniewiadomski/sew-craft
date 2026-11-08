<script setup lang="ts">
import {
  resolveSeamRun,
  roundToThousandth,
  type Assembly,
  type EntityId,
  type PatternDocument,
  type Piece,
  type Vec2,
} from '@sewcraft/geometry';
import { computed, watch } from 'vue';

import AssemblyInstanceList from '@/components/canvas/AssemblyInstanceList.vue';
import { useAssemblyViewport } from '@/composables/use-assembly-viewport';
import { Button } from '@/components/ui/button';
import type { SeamDraftSide } from '@/lib/seam-picks';

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
    /** Seam, finished and unmatched edge overlays. */
    showSeams?: boolean;
    /** Sew mode: edge picking replaces instance dragging. */
    sewActive?: boolean;
    /** The sides picked so far, highlighted while the gesture runs. */
    draftSides?: SeamDraftSide[];
    /** The seam whose side midpoints are joined by guide arcs. */
    selectedSeamId?: EntityId | null;
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
    showSeams: true,
    sewActive: false,
    draftSides: () => [],
    selectedSeamId: null,
  },
);

const emit = defineEmits<{
  select: [instance: EntityId | null];
  move: [instance: EntityId, x: number, y: number];
  nudge: [instance: EntityId, dx: number, dy: number];
  remove: [instance: EntityId];
  'add-piece': [piece: EntityId];
  'close-picker': [];
  'pick-edge': [instance: EntityId, edge: EntityId];
  'hover-edge': [instance: EntityId | null, edge: EntityId | null];
}>();

const assembly = computed<Assembly | null>(
  () => props.document.assemblies.find((candidate) => candidate.id === props.assemblyId) ?? null,
);

/** Every piece the picker offers, in document order. */
const pieces = computed(() => props.pieces ?? props.document.pieces);

function forwardMove(id: EntityId, x: number, y: number): void {
  emit('move', id, x, y);
}

function forwardNudge(id: EntityId, dx: number, dy: number): void {
  emit('nudge', id, dx, dy);
}

function forwardPickEdge(instance: EntityId, edge: EntityId): void {
  emit('pick-edge', instance, edge);
}

function forwardHoverEdge(instance: EntityId | null, edge: EntityId | null): void {
  emit('hover-edge', instance, edge);
}

/** The palette position of a piece, used to name unnamed pieces. */
function pieceIndex(id: EntityId): number {
  return pieces.value.findIndex((candidate) => candidate.id === id);
}

const { svg, view, viewBox, unitPerPixel, pointerWorld, onWheel, beginPan, resetFit } =
  useAssemblyViewport({
    document: () => props.document,
    assembly: () => assembly.value,
  });

/** A stroke width that keeps the edge hit target at a similar screen size. */
const edgeHitWidth = computed(() => Math.max(view.value.width / 150, 0.6));

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

/** The point halfway along an open polyline, by arc length. */
function midpointOf(points: readonly Vec2[]): Vec2 {
  const total = lengthOf(points);
  if (total === 0) return points[0]!;

  const half = total / 2;
  const steps = points
    .slice(1)
    .map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  let walked = 0;
  const index = steps.findIndex((step) => {
    if (walked + step >= half) return true;
    walked += step;
    return false;
  });

  /* v8 ignore next -- a positive total always finds its halfway step */
  const at = index < 0 ? steps.length - 1 : index;
  const previous = points[at]!;
  const point = points[at + 1]!;
  const t = (half - walked) / steps[at]!;
  return { x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t };
}

/** One dashed quadratic arc between two side midpoints. */
function guidePath(a: Vec2, b: Vec2): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const bend = length === 0 ? 0 : length * 0.18;
  const control =
    length === 0
      ? { x: a.x, y: a.y }
      : { x: (a.x + b.x) / 2 - (dy / length) * bend, y: (a.y + b.y) / 2 + (dx / length) * bend };
  return `M ${roundToThousandth(a.x)} ${roundToThousandth(a.y)} Q ${roundToThousandth(control.x)} ${roundToThousandth(control.y)} ${roundToThousandth(b.x)} ${roundToThousandth(b.y)}`;
}

/** Guide arcs from the first side's midpoint to every other side's midpoint. */
const guidePaths = computed(() => {
  const seam = assembly.value?.seams?.find((candidate) => candidate.id === props.selectedSeamId);
  if (seam === undefined || assembly.value === null) return [];

  const midpoints = seam.sides.flatMap((side) => {
    const resolved = resolveSeamRun(props.document, assembly.value!, side);
    return resolved === null ? [] : [midpointOf(resolved.points)];
  });
  if (midpoints.length < 2) return [];

  const origin = midpoints[0]!;
  return midpoints.slice(1).map((point) => guidePath(origin, point));
});

function onCanvasPointerDown(event: PointerEvent): void {
  if (event.button === 1) {
    event.preventDefault();
    beginPan(event);
    return;
  }
  if (event.button === 0) emit('select', null);
}

/** Fit on mount, tab change or the Fit action — never on a document edit. */
watch(
  () => [props.assemblyId, props.fitToken],
  () => {
    resetFit();
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
      <AssemblyInstanceList
        :document="props.document"
        :instances="assembly?.instances ?? []"
        :pieces="pieces"
        :selected-instance-id="props.selectedInstanceId"
        :read-only="props.readOnly"
        :show-cut-shapes="props.showCutShapes"
        :show-allowances="props.showAllowances"
        :show-stitch="props.showStitch"
        :show-folds="props.showFolds"
        :show-notches="props.showNotches"
        :show-labels="props.showLabels"
        :show-seams="props.showSeams"
        :sew-active="props.sewActive"
        :draft-sides="props.draftSides"
        :seams="assembly?.seams ?? []"
        :finished-edges="assembly?.finishedEdges ?? []"
        :edge-hit-width="edgeHitWidth"
        :unit-per-pixel="unitPerPixel"
        :pointer-world="pointerWorld"
        @select="emit('select', $event)"
        @move="forwardMove"
        @nudge="forwardNudge"
        @remove="emit('remove', $event)"
        @pick-edge="forwardPickEdge"
        @hover-edge="forwardHoverEdge"
      />

      <path
        v-for="(guide, index) in guidePaths"
        :key="`guide-${index}`"
        :d="guide"
        fill="none"
        class="stroke-primary"
        stroke-width="0.5"
        stroke-dasharray="4 3"
        data-testid="seam-guide"
      />
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
