<script setup lang="ts">
import type { Constraint } from '@sewcraft/geometry';
import { constraintEntityIds } from '@sewcraft/geometry';

import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import { constraintLabel } from '@/lib/constraint-view';

defineProps<{
  /** Every constraint that is not a dimension; dimensions have their own drawer. */
  constraints: Constraint[];
}>();

const emit = defineEmits<{ remove: [id: string] }>();
</script>

<template>
  <ul v-if="constraints.length > 0" class="space-y-3" aria-label="Constraints">
    <li
      v-for="constraint in constraints"
      :key="constraint.id"
      class="flex items-start justify-between gap-2"
    >
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-baseline gap-1.5">
          <span class="shrink-0 text-[13px] font-medium">{{ constraintLabel(constraint) }}</span>
          <span class="truncate font-mono text-2xs text-muted-foreground">
            {{ constraint.id }}
          </span>
        </div>
        <p class="truncate text-2xs text-muted-foreground">
          ({{ constraintEntityIds(constraint).join(', ') }})
        </p>
      </div>
      <SidebarAction
        icon="delete"
        :label="`Remove constraint ${constraint.id}`"
        :data-testid="`remove-constraint-${constraint.id}`"
        @click="emit('remove', constraint.id)"
      />
    </li>
  </ul>
  <SidebarEmpty
    v-else
    icon="constraints"
    message="No constraints yet."
    hint="Select two points and pick a constraint in the ribbon."
  />
</template>
