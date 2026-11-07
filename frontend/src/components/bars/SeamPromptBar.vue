<script setup lang="ts">
import type { Assembly, EntityId, PatternDocument } from '@sewcraft/geometry';
import { resolveSeamRun } from '@sewcraft/geometry';
import { computed } from 'vue';

import { Button } from '@/components/ui/button';
import { seamDraftRun, seamDraftSides, type SeamDraft, type SeamDraftSide } from '@/lib/seam-picks';

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    assembly: Assembly;
    draft: SeamDraft;
    eased: boolean;
    readOnly?: boolean;
  }>(),
  { readOnly: false },
);

const emit = defineEmits<{
  'new-side': [];
  flip: [];
  'remove-pick': [instance: EntityId, edge: EntityId];
  'update:eased': [value: boolean];
  commit: [];
  cancel: [];
}>();

const sides = computed(() => seamDraftSides(props.draft));

/** The resolved length of each side, or `null` when it cannot resolve. */
const lengths = computed(() =>
  sides.value.map(
    (side) => resolveSeamRun(props.document, props.assembly, seamDraftRun(side))?.length ?? null,
  ),
);

/** The largest minus the smallest resolved side length. */
const delta = computed(() => {
  const resolved = lengths.value.filter((length): length is number => length !== null);
  if (resolved.length < 2) return null;
  return Math.max(...resolved) - Math.min(...resolved);
});

const canSew = computed(() => sides.value.length >= 2);
const canNewSide = computed(
  () => props.draft.current !== null && props.draft.current.edges.length > 0,
);

const announcement = computed(() => {
  const edges = sides.value.reduce((total, side) => total + side.edges.length, 0);
  const base = `${edges} ${edges === 1 ? 'edge' : 'edges'} picked, ${sides.value.length} ${
    sides.value.length === 1 ? 'side' : 'sides'
  }`;
  return delta.value === null ? base : `${base}, ${delta.value.toFixed(1)} mm apart`;
});

/** The piece label an instance places, with the palette fallback. */
function instanceLabel(id: EntityId): string {
  const instance = props.assembly.instances.find((candidate) => candidate.id === id);
  const index = props.document.pieces.findIndex((piece) => piece.id === instance?.piece);
  if (index < 0) return 'Piece';
  const piece = props.document.pieces[index]!;
  return piece.name?.trim() || `Piece ${index + 1}`;
}

function lengthOf(side: SeamDraftSide): string {
  const index = sides.value.indexOf(side);
  const length = lengths.value[index] ?? null;
  return length === null ? '—' : `${length.toFixed(1)} mm`;
}

function toggleEased(event: Event): void {
  emit('update:eased', (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2 border-b bg-background px-2 py-1"
    data-testid="seam-prompt-bar"
    role="status"
    aria-live="polite"
  >
    <span class="text-sm font-medium">Sew</span>
    <span class="sr-only" data-testid="seam-announcement">{{ announcement }}</span>

    <div class="flex flex-wrap items-center gap-1" data-testid="seam-side-chips">
      <div
        v-for="(side, index) in sides"
        :key="`${side.instance}-${index}`"
        class="flex items-center gap-1 rounded-md border bg-surface px-1.5 py-0.5 text-xs"
        :data-testid="`seam-side-${index}`"
      >
        <span class="font-medium">Side {{ index + 1 }}</span>
        <span class="text-muted-foreground">{{ instanceLabel(side.instance) }}</span>
        <span class="tabular-nums">{{ lengthOf(side) }}</span>
        <span v-if="side.reversed" class="text-muted-foreground">reversed</span>
        <button
          v-for="edge in side.edges"
          :key="edge"
          type="button"
          class="rounded-sm px-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          :aria-label="`Remove ${edge} from side ${index + 1}`"
          :data-testid="`seam-pick-${side.instance}-${edge}`"
          @click="emit('remove-pick', side.instance, edge)"
        >
          ×
        </button>
      </div>
      <span v-if="sides.length === 0" class="text-xs text-muted-foreground">
        Pick a stitch edge to start.
      </span>
    </div>

    <span
      v-if="delta !== null"
      class="text-xs tabular-nums"
      :class="delta > 5 ? 'text-destructive' : 'text-muted-foreground'"
      data-testid="seam-delta"
    >
      Δ {{ delta.toFixed(1) }} mm
    </span>

    <label class="flex items-center gap-1 text-xs">
      <input
        type="checkbox"
        :checked="eased"
        :disabled="!canSew"
        data-testid="seam-eased"
        @change="toggleEased"
      />
      Eased
    </label>

    <Button
      variant="outline"
      size="sm"
      :disabled="!canNewSide"
      data-testid="seam-new-side"
      @click="emit('new-side')"
    >
      New side
    </Button>
    <Button
      variant="outline"
      size="sm"
      :disabled="sides.length === 0"
      data-testid="seam-flip"
      @click="emit('flip')"
    >
      Flip
    </Button>
    <Button
      size="sm"
      :disabled="!canSew || props.readOnly"
      data-testid="seam-commit"
      @click="emit('commit')"
    >
      Sew
    </Button>
    <Button variant="outline" size="sm" data-testid="seam-cancel" @click="emit('cancel')">
      Cancel
    </Button>
  </div>
</template>
