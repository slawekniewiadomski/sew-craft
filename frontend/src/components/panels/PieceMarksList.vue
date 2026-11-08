<script setup lang="ts">
import type { EntityId } from '@sewcraft/geometry';

import Pill from '@/components/sidebar/Pill.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import { formatDimensionValue } from '@/lib/dimensions';
import type { PieceMarkRow } from '@/lib/pieces';

const props = withDefaults(
  defineProps<{
    marks: PieceMarkRow[];
    /** The piece the marks belong to, for the list's accessible name. */
    pieceId: EntityId;
    /** Prefix for the card's data-testids, so two mounted cards never collide. */
    prefix?: string;
  }>(),
  { prefix: 'entity' },
);

const emit = defineEmits<{
  'delete-mark': [id: EntityId];
  'set-notch-depth': [id: EntityId, depth: number | null];
}>();

function testId(suffix: string): string {
  return `${props.prefix}-${suffix}`;
}

/** The depth field is a percentage; anything outside 5–90 is clamped. */
function notchDepth(row: PieceMarkRow, event: Event): void {
  const input = event.target as HTMLInputElement;
  const percent = Number(input.value);
  emit('set-notch-depth', row.id, Math.min(90, Math.max(5, percent)) / 100);
}
</script>

<template>
  <details v-if="marks.length > 0" class="group border-t pt-3">
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-2 text-2xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden"
    >
      <span>
        Marks
        <span class="ml-1 tabular-nums">{{ marks.length }}</span>
      </span>
      <span aria-hidden="true" class="transition-transform group-open:rotate-180">⌄</span>
    </summary>
    <ul class="mt-2 space-y-2" :aria-label="`Marks on piece ${pieceId}`">
      <li
        v-for="row in marks"
        :key="row.id"
        class="flex flex-wrap items-center gap-1.5 rounded-md px-1 py-0.5"
        :data-testid="testId(`piece-mark-${row.id}`)"
      >
        <span class="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
          {{ row.type === 'notch' ? 'Notch' : row.detail }}
        </span>
        <Pill v-if="row.broken" tone="neutral" :data-testid="testId(`piece-mark-broken-${row.id}`)">
          Broken
        </Pill>
        <template v-if="row.type === 'notch' && !row.broken">
          <SidebarInput
            type="number"
            min="5"
            max="90"
            step="5"
            class="w-16 tabular-nums"
            :value="Math.round(row.depth * 100)"
            :aria-label="`Depth share for notch ${row.id}`"
            :data-testid="testId(`piece-mark-depth-${row.id}`)"
            @change="notchDepth(row, $event)"
          />
          <span class="text-2xs text-muted-foreground">%</span>
          <span
            class="text-2xs tabular-nums text-muted-foreground"
            :data-testid="testId(`piece-mark-reach-${row.id}`)"
          >
            {{ formatDimensionValue(row.cutDistance) }} mm
          </span>
        </template>
        <SidebarButton
          :data-testid="testId(`piece-mark-delete-${row.id}`)"
          @click="emit('delete-mark', row.id)"
        >
          Delete
        </SidebarButton>
      </li>
    </ul>
  </details>
</template>
