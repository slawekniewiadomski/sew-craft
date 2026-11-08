<script setup lang="ts">
import { type Assembly, type EntityId, type PatternDocument, type Piece } from '@sewcraft/geometry';
import { computed, watch } from 'vue';

import AssemblyInstanceList from '@/components/canvas/AssemblyInstanceList.vue';
import { useAssemblyViewport } from '@/composables/use-assembly-viewport';
import { Button } from '@/components/ui/button';

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

/** The palette position of a piece, used to name unnamed pieces. */
function pieceIndex(id: EntityId): number {
  return pieces.value.findIndex((candidate) => candidate.id === id);
}

const { svg, view, viewBox, unitPerPixel, onWheel, beginPan, resetFit } = useAssemblyViewport({
  document: () => props.document,
  assembly: () => assembly.value,
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
        :unit-per-pixel="unitPerPixel"
        @select="emit('select', $event)"
        @move="forwardMove"
        @nudge="forwardNudge"
        @remove="emit('remove', $event)"
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
