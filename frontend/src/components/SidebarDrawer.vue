<script setup lang="ts">
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { DrawerId } from '@/lib/editor-drawers';

const props = defineProps<{
  id: DrawerId;
  label: string;
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
}>();

function onOpenChange(open: boolean): void {
  emit('update:open', open);
}
</script>

<template>
  <Collapsible :open="props.open" @update:open="onOpenChange">
    <CollapsibleTrigger
      class="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-accent"
      :data-testid="`drawer-toggle-${props.id}`"
    >
      <span>{{ props.label }}</span>
      <span aria-hidden="true">{{ props.open ? '▾' : '▸' }}</span>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="px-3 pb-3" :data-testid="`drawer-content-${props.id}`">
        <slot />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
