<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarDrawer from '@/components/SidebarDrawer.vue';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EDITOR_DRAWERS, initialDrawerState, type DrawerId } from '@/lib/editor-drawers';

const props = defineProps<{
  width: number;
  collapsed: boolean;
  /** Per-drawer row counts, forwarded to the drawer header badges. */
  counts?: Partial<Record<DrawerId, number>>;
  /** Mutating drawer controls are disabled; the View drawer keeps export toggles. */
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  'update:width': [width: number];
  'update:collapsed': [collapsed: boolean];
}>();

const open = ref(initialDrawerState());
const resizing = ref(false);
const startX = ref(0);
const startWidth = ref(0);

function setOpen(id: DrawerId, value: boolean): void {
  open.value = { ...open.value, [id]: value };
}

/** The rail is navigation: expand, then open (never close) the chosen drawer. */
function openFromRail(id: DrawerId): void {
  setOpen(id, true);
  emit('update:collapsed', false);
}

function onResizeStart(event: PointerEvent): void {
  resizing.value = true;
  startX.value = event.clientX;
  startWidth.value = props.width;
  window.addEventListener('pointermove', onResizeMove);
  window.addEventListener('pointerup', onResizeEnd);
}

function onResizeMove(event: PointerEvent): void {
  emit('update:width', startWidth.value - (event.clientX - startX.value));
}

function onResizeEnd(): void {
  resizing.value = false;
  removeResizeListeners();
}

function removeResizeListeners(): void {
  window.removeEventListener('pointermove', onResizeMove);
  window.removeEventListener('pointerup', onResizeEnd);
}

onBeforeUnmount(removeResizeListeners);
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <aside
      class="flex h-full min-h-0 border-l bg-background"
      :style="collapsed ? undefined : { width: `${width}px` }"
      data-testid="sidebar"
    >
      <div
        v-if="!collapsed"
        class="w-1 shrink-0 cursor-col-resize touch-none"
        :class="resizing ? 'bg-primary' : 'bg-transparent hover:bg-border'"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        data-testid="sidebar-resize"
        @pointerdown.prevent="onResizeStart"
      />

      <div v-if="!collapsed" class="flex h-full min-h-0 flex-1 flex-col">
        <div class="flex items-center justify-end border-b px-1 py-1">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Collapse sidebar"
                data-testid="sidebar-collapse"
                @click="emit('update:collapsed', true)"
              >
                »
              </Button>
            </TooltipTrigger>
            <TooltipContent>Collapse sidebar</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea class="min-h-0 flex-1">
          <SidebarDrawer
            v-for="drawer in EDITOR_DRAWERS"
            :key="drawer.id"
            :id="drawer.id"
            :label="drawer.label"
            :open="open[drawer.id]"
            :count="props.counts?.[drawer.id]"
            @update:open="(value: boolean) => setOpen(drawer.id, value)"
          >
            <fieldset class="contents" :disabled="readOnly && drawer.id !== 'view'">
              <slot :name="drawer.id" />
            </fieldset>
          </SidebarDrawer>
        </ScrollArea>

        <slot v-if="$slots.stats" name="stats" />
      </div>

      <div v-else class="flex h-full w-12 flex-col items-center gap-1 py-2">
        <SidebarAction
          v-for="drawer in EDITOR_DRAWERS"
          :key="drawer.id"
          :icon="drawer.icon"
          :label="`Open ${drawer.label} drawer`"
          :data-testid="`sidebar-rail-${drawer.id}`"
          @click="openFromRail(drawer.id)"
        />

        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="mt-auto"
              aria-label="Expand sidebar"
              data-testid="sidebar-expand"
              @click="emit('update:collapsed', false)"
            >
              «
            </Button>
          </TooltipTrigger>
          <TooltipContent>Expand sidebar</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  </TooltipProvider>
</template>
