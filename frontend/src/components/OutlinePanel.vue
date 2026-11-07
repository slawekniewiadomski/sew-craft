<script setup lang="ts">
import type { EntityId, Param } from '@sewcraft/geometry';

import RibbonIcon from '@/components/RibbonIcon.vue';
import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import type { RibbonIconName } from '@/lib/ribbon-icons';
import { ribbonIcon } from '@/lib/ribbon-icons';
import { selectionModeFrom, type SelectionMode } from '@/lib/selection';

/** One edge row: a line, curve, arc or circle the maker can convert or inspect. */
export interface OutlineRow {
  id: EntityId;
  kind: 'line' | 'curve' | 'arc' | 'circle';
  label: string;
  construction: boolean;
  seamWidth: number | null;
  pieceId: EntityId | null;
  allowanceKind: string | null;
  allowanceWidth: Param | null;
}

defineProps<{
  edges: OutlineRow[];
  selectedIds: ReadonlySet<EntityId>;
}>();

const emit = defineEmits<{
  select: [id: EntityId, mode: SelectionMode];
  convert: [id: EntityId, construction: boolean];
}>();

const EDGE_KIND_LABELS: Record<OutlineRow['kind'], string> = {
  line: 'Line',
  curve: 'Curve',
  arc: 'Arc',
  circle: 'Circle',
};

const EDGE_KIND_ICONS: Record<OutlineRow['kind'], RibbonIconName> = {
  line: 'line',
  curve: 'curve',
  arc: 'arc',
  circle: 'circle',
};
</script>

<template>
  <ul v-if="edges.length > 0" class="space-y-1" aria-label="Edges">
    <li
      v-for="edge in edges"
      :key="edge.id"
      class="flex items-center gap-1 rounded-sm border-l-2 border-transparent"
      :class="selectedIds.has(edge.id) ? 'border-primary bg-primary/10' : ''"
      :data-testid="`outline-row-${edge.id}`"
    >
      <button
        type="button"
        class="flex w-full min-w-0 flex-1 flex-col gap-0.5 rounded-sm px-1.5 py-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        :aria-label="`Select entity ${edge.id}`"
        :aria-current="selectedIds.has(edge.id) ? 'true' : undefined"
        :data-testid="`outline-select-${edge.id}`"
        @click="emit('select', edge.id, selectionModeFrom($event))"
      >
        <span class="flex w-full min-w-0 items-center gap-1.5">
          <RibbonIcon
            :icon="ribbonIcon(EDGE_KIND_ICONS[edge.kind])"
            :size="12"
            class="shrink-0 text-muted-foreground"
          />
          <span class="shrink-0 text-[13px] font-medium">
            {{ EDGE_KIND_LABELS[edge.kind] }}
          </span>
          <span class="truncate font-mono text-2xs text-muted-foreground">
            {{ edge.label }}
          </span>

          <Pill
            v-if="edge.seamWidth !== null"
            tone="accent"
            class="ml-auto shrink-0"
            :data-testid="`seam-label-${edge.id}`"
          >
            Allowance {{ edge.seamWidth }} mm
          </Pill>
        </span>

        <span
          v-if="edge.seamWidth === null"
          class="flex w-full min-w-0 items-center gap-1.5"
          :data-testid="`edge-piece-${edge.id}`"
        >
          <template v-if="edge.pieceId !== null">
            <span class="truncate text-2xs text-muted-foreground">
              In piece {{ edge.pieceId }}
            </span>
            <Pill v-if="edge.allowanceKind !== null" tone="accent" class="ml-auto shrink-0">
              {{ edge.allowanceKind }} {{ edge.allowanceWidth }} mm
            </Pill>
          </template>
          <Pill v-else tone="neutral" class="border-dashed" :data-testid="`seam-empty-${edge.id}`">
            No allowance
          </Pill>
        </span>
      </button>

      <SidebarAction
        icon="line"
        :label="edge.construction ? 'Make cut edge' : 'Make construction'"
        :data-testid="`outline-construction-${edge.id}`"
        @click="emit('convert', edge.id, !edge.construction)"
      />
    </li>
  </ul>
  <SidebarEmpty
    v-else
    icon="line"
    message="No edges yet."
    hint="Draw a line, curve, arc or circle to see it here."
  />
</template>
