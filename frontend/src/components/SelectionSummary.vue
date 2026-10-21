<script setup lang="ts">
import type { Entity } from '@sewcraft/geometry';
import { computed } from 'vue';

import { Button } from '@/components/ui/button';

const props = withDefaults(
  defineProps<{
    /** The selected entities, in selection order. */
    entities: Entity[];
    /** Refuse Delete while a selected point would orphan an edge. */
    deleteDisabled?: boolean;
    /** Explains why Delete is refused; shown as the button tooltip. */
    deleteHint?: string;
  }>(),
  { deleteDisabled: false, deleteHint: undefined },
);

const emit = defineEmits<{ delete: [] }>();

const counts = computed(() => {
  const points = props.entities.filter((entity) => entity.kind === 'point').length;
  const lines = props.entities.filter((entity) => entity.kind === 'line').length;
  const curves = props.entities.filter((entity) => entity.kind === 'curve').length;
  const arcs = props.entities.filter((entity) => entity.kind === 'arc').length;
  return { points, lines, curves, arcs };
});

const countLabel = computed(() =>
  props.entities.length === 1 ? '1 entity selected' : `${props.entities.length} entities selected`,
);

/** “2 lines · 1 curve · 1 arc · 1 point”, omitting kinds that are not selected. */
const breakdown = computed(() => {
  const parts: string[] = [];
  if (counts.value.points > 0) {
    parts.push(`${counts.value.points} point${counts.value.points === 1 ? '' : 's'}`);
  }
  if (counts.value.lines > 0) {
    parts.push(`${counts.value.lines} line${counts.value.lines === 1 ? '' : 's'}`);
  }
  if (counts.value.curves > 0) {
    parts.push(`${counts.value.curves} curve${counts.value.curves === 1 ? '' : 's'}`);
  }
  if (counts.value.arcs > 0) {
    parts.push(`${counts.value.arcs} arc${counts.value.arcs === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
});
</script>

<template>
  <section class="space-y-2 text-sm" aria-label="Selection" data-testid="selection-summary">
    <h3 class="text-xs font-semibold uppercase text-muted-foreground">Selection</h3>
    <p class="font-medium" data-testid="selection-count">{{ countLabel }}</p>
    <p class="text-xs text-muted-foreground" data-testid="selection-breakdown">{{ breakdown }}</p>
    <Button
      variant="outline"
      size="sm"
      :disabled="deleteDisabled"
      :title="deleteHint"
      data-testid="selection-delete"
      @click="emit('delete')"
    >
      Delete selection
    </Button>
    <p class="text-xs text-muted-foreground" data-testid="selection-pointer-note">
      Rectangle selection is pointer-only. Ctrl/Cmd-click adds or removes an entity.
    </p>
  </section>
</template>
