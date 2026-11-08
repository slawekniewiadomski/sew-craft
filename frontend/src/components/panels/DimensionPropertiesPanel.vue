<script setup lang="ts">
import type { EntityId, PatternDocument } from '@sewcraft/geometry';
import { computed } from 'vue';

import DimensionsPanel from '@/components/panels/DimensionsPanel.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import type { DimensionPatch } from '@/lib/dimensions';
import type { SelectionMode } from '@/lib/selection';

const props = defineProps<{
  document: PatternDocument;
  dimensionId: EntityId;
}>();

const emit = defineEmits<{
  select: [id: EntityId, mode: SelectionMode];
  update: [id: EntityId, patch: DimensionPatch];
  remove: [id: EntityId];
}>();

/** The one row this Properties section owns. */
const only = computed(() => new Set([props.dimensionId]));

function onSelect(id: EntityId, mode: SelectionMode): void {
  emit('select', id, mode);
}

function onUpdate(id: EntityId, patch: DimensionPatch): void {
  emit('update', id, patch);
}
</script>

<template>
  <SidebarSection
    label="Dimension"
    heading-id="dimension-properties-heading"
    data-testid="dimension-properties"
  >
    <DimensionsPanel
      :document="document"
      :selected-ids="only"
      :only="only"
      @select="onSelect"
      @update="onUpdate"
      @remove="emit('remove', $event)"
    />
  </SidebarSection>
</template>
