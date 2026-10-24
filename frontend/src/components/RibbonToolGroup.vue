<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { RibbonToolGroupItem, RibbonToolItem } from '@/lib/editor-ribbon';
import type { EditorTool } from '@/lib/editor-tools';
import { ribbonIcon } from '@/lib/ribbon-icons';

import RibbonIcon from './RibbonIcon.vue';

const props = defineProps<{
  item: RibbonToolGroupItem;
  activeTool: EditorTool;
  /** True when any member is the active tool and no constraint is armed. */
  active?: boolean;
  /** A read-only document disables both halves and keeps the menu closed. */
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  'select-tool': [tool: EditorTool];
}>();

const open = ref(false);
const lastArmed = ref<EditorTool | null>(null);
const caret = ref<HTMLButtonElement | null>(null);

function isMember(tool: EditorTool): boolean {
  return props.item.items.some((mode) => mode.tool === tool);
}

// The displayed mode follows the active tool while it is a member, and keeps
// the last armed member afterwards, so the icon half is honest about what a
// click would arm.
watch(
  () => props.activeTool,
  (tool) => {
    if (isMember(tool)) lastArmed.value = tool;
    open.value = false;
  },
  { immediate: true },
);

const displayed = computed<RibbonToolItem>(() => {
  const mode = isMember(props.activeTool)
    ? props.activeTool
    : (lastArmed.value ?? props.item.primary.tool);
  return props.item.items.find((item) => item.tool === mode)!;
});

function arm(mode: RibbonToolItem): void {
  open.value = false;
  lastArmed.value = mode.tool;
  // Choosing from a radio menu is a selection, not a toggle, so the armed mode
  // stays armed instead of returning to Select.
  if (mode.tool !== props.activeTool) emit('select-tool', mode.tool);
}

function close(): void {
  open.value = false;
}

function closeOnEscape(): void {
  // Escape is consumed here: the canvas's window handler would otherwise reset
  // the active tool while the menu only meant to close.
  close();
  void nextTick(() => caret.value?.focus());
}
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <DropdownMenu v-model:open="open" :modal="false">
      <div class="flex items-stretch">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              :variant="props.active ? 'default' : 'ghost'"
              size="icon"
              class="rounded-r-none"
              :data-testid="item.id"
              :data-mode="displayed.tool"
              :disabled="props.readOnly"
              :aria-label="displayed.label"
              :aria-pressed="props.active ? 'true' : undefined"
              @click="emit('select-tool', displayed.tool)"
            >
              <RibbonIcon :icon="ribbonIcon(displayed.icon)" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ displayed.label }}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <DropdownMenuTrigger as-child>
              <button
                ref="caret"
                type="button"
                class="inline-flex h-9 w-5 items-center justify-center rounded-r-md border-l border-input text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent"
                :data-testid="`${item.id}-modes`"
                :disabled="props.readOnly"
                :aria-label="`${item.label} modes`"
              >
                <RibbonIcon :icon="ribbonIcon('chevron-down')" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{{ item.label }} modes</TooltipContent>
        </Tooltip>
      </div>
      <DropdownMenuContent
        align="start"
        class="min-w-[11rem]"
        @keydown.escape.stop.prevent="closeOnEscape"
        @keydown.tab="close"
      >
        <DropdownMenuRadioGroup :model-value="displayed.tool">
          <DropdownMenuRadioItem
            v-for="mode in item.items"
            :key="mode.tool"
            :value="mode.tool"
            :data-testid="mode.id"
            @select="arm(mode)"
          >
            <RibbonIcon :icon="ribbonIcon(mode.icon)" />
            {{ mode.label }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </TooltipProvider>
</template>
