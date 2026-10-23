<script setup lang="ts">
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { DrawerId } from '@/lib/editor-drawers';

const props = defineProps<{
  id: DrawerId;
  label: string;
  open: boolean;
  /** Optional badge; zero and undefined both render no badge. */
  count?: number;
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
      class="sticky top-0 z-10 flex w-full items-center gap-1.5 border-b bg-background px-3 py-2 text-left text-2xs font-semibold tracking-[0.06em] text-muted-foreground uppercase hover:text-foreground"
      :data-testid="`drawer-toggle-${props.id}`"
    >
      <svg
        class="size-2.5 shrink-0 transition-transform"
        :class="{ 'rotate-90': props.open }"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        :data-testid="`drawer-chevron-${props.id}`"
      >
        <path d="M4.5 3 7.5 6 4.5 9" />
      </svg>
      <span class="min-w-0 truncate">{{ props.label }}</span>
      <span
        v-if="props.count !== undefined && props.count > 0"
        class="ml-auto shrink-0 rounded-sm border px-1 font-medium text-muted-foreground tabular-nums"
        data-testid="drawer-count"
        >{{ props.count }}</span
      >
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="px-3 pt-2 pb-3" :data-testid="`drawer-content-${props.id}`">
        <slot />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
