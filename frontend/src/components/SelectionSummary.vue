<script setup lang="ts">
import type { Entity } from '@sewcraft/geometry';
import { computed } from 'vue';

import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarHeading from '@/components/sidebar/SidebarHeading.vue';

const props = withDefaults(
  defineProps<{
    /** The selected entities, in selection order. */
    entities?: Entity[];
    /** How many dimensions are selected; they render alone or beside entities. */
    dimensions?: number;
    /** Refuse Delete while a selected point would orphan an edge. */
    deleteDisabled?: boolean;
    /** Explains why Delete is refused; shown as the button tooltip. */
    deleteHint?: string;
  }>(),
  { entities: () => [], dimensions: 0, deleteDisabled: false, deleteHint: undefined },
);

const emit = defineEmits<{ delete: [] }>();

const dimensionMode = computed(() => props.dimensions > 0);

/** A committed marquee is the one gesture that can select both kinds at once. */
const mixed = computed(() => props.entities.length > 0 && props.dimensions > 0);

const counts = computed(() => {
  const points = props.entities.filter((entity) => entity.kind === 'point').length;
  const lines = props.entities.filter((entity) => entity.kind === 'line').length;
  const curves = props.entities.filter((entity) => entity.kind === 'curve').length;
  const arcs = props.entities.filter((entity) => entity.kind === 'arc').length;
  return { points, lines, curves, arcs };
});

const countLabel = computed(() => {
  if (mixed.value) {
    const entities = props.entities.length;
    return `${entities} ${entities === 1 ? 'entity' : 'entities'} and ${props.dimensions} ${
      props.dimensions === 1 ? 'dimension' : 'dimensions'
    } selected`;
  }
  if (dimensionMode.value) {
    return props.dimensions === 1
      ? '1 dimension selected'
      : `${props.dimensions} dimensions selected`;
  }
  return props.entities.length === 1
    ? '1 entity selected'
    : `${props.entities.length} entities selected`;
});

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
  <section class="space-y-2" aria-label="Selection" data-testid="selection-summary">
    <SidebarHeading label="Selection" />
    <p class="text-[13px] font-semibold tabular-nums" data-testid="selection-count">
      {{ countLabel }}
    </p>
    <p
      v-if="!dimensionMode || mixed"
      class="text-2xs text-muted-foreground"
      data-testid="selection-breakdown"
    >
      {{ breakdown }}
    </p>
    <SidebarAction
      icon="delete"
      label="Delete selection"
      :title="props.deleteHint"
      :disabled="props.deleteDisabled"
      data-testid="selection-delete"
      @click="emit('delete')"
    />
    <p class="text-2xs leading-snug text-muted-foreground" data-testid="selection-pointer-note">
      {{
        dimensionMode
          ? 'Ctrl/Cmd-click adds or removes a dimension.'
          : 'Rectangle selection is pointer-only. Ctrl/Cmd-click adds or removes an entity.'
      }}
    </p>
  </section>
</template>
