<script setup lang="ts">
import { computed } from 'vue';

import RibbonIcon from '@/components/RibbonIcon.vue';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CanvasDisplayItem } from '@/lib/display-settings';
import { ribbonIcon } from '@/lib/ribbon-icons';

const props = withDefaults(
  defineProps<{
    items: CanvasDisplayItem[];
    /** The current on/off state, keyed by item id. */
    values: Record<string, boolean>;
    /** Tooltip and accessible name; the control is icon-only. */
    label?: string;
  }>(),
  { label: 'Display settings' },
);

const emit = defineEmits<{ toggle: [key: string, value: boolean] }>();

const menuItems = computed(() =>
  props.items.map((item) => ({ ...item, checked: props.values[item.key] === true })),
);
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <Tooltip>
      <DropdownMenu :modal="false">
        <TooltipTrigger as-child>
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              class="inline-flex size-7 items-center justify-center rounded-md border bg-background/90 text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="props.label"
              data-testid="display-menu-trigger"
            >
              <RibbonIcon :icon="ribbonIcon('eye')" :size="14" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{{ props.label }}</TooltipContent>
        <DropdownMenuContent align="end" side="top" :side-offset="6" class="min-w-44">
          <DropdownMenuCheckboxItem
            v-for="item in menuItems"
            :key="item.key"
            :model-value="item.checked"
            :data-testid="`display-${item.key}`"
            @update:model-value="(value: boolean) => emit('toggle', item.key, value)"
            @select.prevent
          >
            {{ item.label }}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Tooltip>
  </TooltipProvider>
</template>
