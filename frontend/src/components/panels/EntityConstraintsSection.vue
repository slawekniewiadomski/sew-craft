<script setup lang="ts">
import type { EntityId } from '@sewcraft/geometry';

import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import type { EntityProperties } from '@/lib/entity-properties';

defineProps<{
  entity: EntityProperties;
  /** The entity's noun, for the empty-state sentence. */
  entityNoun: string;
}>();

const emit = defineEmits<{ 'remove-constraint': [id: EntityId] }>();
</script>

<template>
  <SidebarSection label="Constraints" heading-id="entity-constraints-heading">
    <ul
      v-if="entity.constraints.length > 0"
      class="space-y-3"
      :aria-label="`Constraints for ${entity.id}`"
    >
      <li
        v-for="constraint in entity.constraints"
        :key="constraint.id"
        class="flex items-start justify-between gap-2"
        :data-testid="`entity-constraint-${constraint.id}`"
      >
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-baseline gap-1.5">
            <span class="shrink-0 text-[13px] font-medium">{{ constraint.label }}</span>
            <span class="truncate font-mono text-2xs text-muted-foreground">
              {{ constraint.id }}
            </span>
          </div>
          <p class="truncate text-2xs text-muted-foreground">
            ({{ constraint.entities.join(', ') }})
          </p>
        </div>
        <SidebarAction
          icon="delete"
          :label="`Remove constraint ${constraint.id}`"
          :data-testid="`entity-remove-constraint-${constraint.id}`"
          @click="emit('remove-constraint', constraint.id)"
        />
      </li>
    </ul>
    <SidebarEmpty v-else :message="`No constraints on this ${entityNoun}.`" />
  </SidebarSection>
</template>
