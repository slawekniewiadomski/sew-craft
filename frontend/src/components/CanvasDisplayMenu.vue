<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import RibbonIcon from '@/components/RibbonIcon.vue';
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

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);

const menuItems = computed(() =>
  props.items.map((item) => ({ ...item, checked: props.values[item.key] === true })),
);

function toggleMenu(): void {
  open.value = !open.value;
}

function close(): void {
  open.value = false;
}

/** A click outside the trigger and the panel dismisses the menu. */
function onWindowPointerDown(event: PointerEvent): void {
  if (root.value!.contains(event.target as Node | null)) return;
  close();
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  close();
  trigger.value?.focus();
}

function removeWindowListeners(): void {
  window.removeEventListener('pointerdown', onWindowPointerDown);
  window.removeEventListener('keydown', onWindowKeydown);
}

watch(open, (value) => {
  if (value) {
    window.addEventListener('pointerdown', onWindowPointerDown);
    window.addEventListener('keydown', onWindowKeydown);
  } else {
    removeWindowListeners();
  }
});

onBeforeUnmount(removeWindowListeners);
</script>

<template>
  <div ref="root" class="relative">
    <TooltipProvider :delay-duration="300">
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            ref="trigger"
            type="button"
            class="inline-flex size-7 items-center justify-center rounded-md border bg-background/90 text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="props.label"
            :aria-expanded="open"
            aria-haspopup="menu"
            data-testid="display-menu-trigger"
            @click="toggleMenu"
          >
            <RibbonIcon :icon="ribbonIcon('eye')" :size="14" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ props.label }}</TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <div
      v-if="open"
      role="menu"
      :aria-label="props.label"
      class="absolute bottom-full right-0 z-30 mb-2 w-44 rounded-md border bg-popover p-1 shadow-md"
      data-testid="display-menu"
    >
      <button
        v-for="item in menuItems"
        :key="item.key"
        type="button"
        role="menuitemcheckbox"
        class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        :aria-checked="item.checked"
        :data-testid="`display-${item.key}`"
        @click="emit('toggle', item.key, !item.checked)"
      >
        <span class="flex size-4 items-center justify-center">
          <svg
            v-if="item.checked"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
