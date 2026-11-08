<script setup lang="ts">
import type { EntityId, PatternDocument } from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import RibbonIcon from '@/components/base/RibbonIcon.vue';
import OutlinePanel from '@/components/panels/OutlinePanel.vue';
import { outlineRowCount, outlineTree } from '@/lib/outline-tree';
import { ribbonIcon } from '@/lib/ribbon-icons';
import type { SelectionMode } from '@/lib/selection';

const props = defineProps<{
  document: PatternDocument;
  selectedIds: ReadonlySet<EntityId>;
  selectedDimensionIds: ReadonlySet<EntityId>;
  activePieceId: EntityId | null;
  /** The row to reveal when the selection changes. */
  focusId: EntityId | null;
}>();

const emit = defineEmits<{
  select: [ids: EntityId[], mode: SelectionMode];
  'select-dimension': [id: EntityId, mode: SelectionMode];
  'open-piece': [id: EntityId];
}>();

const open = ref(true);
const outline = computed(() => outlineTree(props.document));
const count = computed(() => outlineRowCount(outline.value));

function onSelect(ids: EntityId[], mode: SelectionMode): void {
  emit('select', ids, mode);
}

function onSelectDimension(id: EntityId, mode: SelectionMode): void {
  emit('select-dimension', id, mode);
}
</script>

<template>
  <div class="pointer-events-none absolute inset-0" data-testid="outline-float">
    <aside
      v-if="open"
      class="pointer-events-auto absolute left-2 top-2 z-20 flex max-h-[calc(100%-1rem)] w-64 flex-col overflow-hidden rounded-md border bg-background/95 shadow-lg backdrop-blur"
      aria-label="Outline"
      data-testid="outline-float-panel"
    >
      <div class="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
        <RibbonIcon :icon="ribbonIcon('line')" :size="13" class="shrink-0 text-muted-foreground" />
        <span class="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          Outline
        </span>
        <span
          class="ml-auto text-2xs tabular-nums text-muted-foreground"
          data-testid="outline-count"
        >
          {{ count }}
        </span>
        <button
          type="button"
          class="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Hide outline"
          data-testid="outline-hide"
          @click="open = false"
        >
          <RibbonIcon :icon="ribbonIcon('chevron-down')" :size="12" class="rotate-90" />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-1">
        <OutlinePanel
          :outline="outline"
          :selected-ids="selectedIds"
          :selected-dimension-ids="selectedDimensionIds"
          :active-piece-id="activePieceId"
          :focus-id="focusId"
          @select="onSelect"
          @select-dimension="onSelectDimension"
          @open-piece="emit('open-piece', $event)"
        />
      </div>
    </aside>

    <button
      v-else
      type="button"
      class="pointer-events-auto absolute left-2 top-2 z-20 flex items-center gap-1 rounded-md border bg-background/95 px-2 py-1 text-2xs font-medium shadow-lg backdrop-blur hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label="Show outline"
      data-testid="outline-show"
      @click="open = true"
    >
      <RibbonIcon :icon="ribbonIcon('line')" :size="12" />
      Outline
    </button>
  </div>
</template>
