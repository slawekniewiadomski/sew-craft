<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import RibbonIcon from '@/components/base/RibbonIcon.vue';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  panelsFor,
  readPersistedPanel,
  writePersistedPanel,
  type PanelId,
  type PanelMode,
} from '@/lib/editor-panels';
import { ribbonIcon } from '@/lib/ribbon-icons';

const props = withDefaults(
  defineProps<{
    width: number;
    collapsed: boolean;
    /** The project the active section preference belongs to. */
    patternId: string;
    /** Per-panel row counts, shown on the rail and in the panel header. */
    counts?: Partial<Record<PanelId, number>>;
    /** Mutating panel controls are disabled; the rail stays usable. */
    readOnly?: boolean;
    /** The active tab kind selects which sections exist. */
    mode?: PanelMode;
  }>(),
  { mode: 'piece' },
);

const emit = defineEmits<{
  'update:width': [width: number];
  'update:collapsed': [collapsed: boolean];
}>();

/** The rail is fixed chrome; the persisted width belongs to the panel itself. */
const RAIL_WIDTH = 40;

const mode = computed<PanelMode>(() => props.mode);
const panels = computed(() => panelsFor(mode.value));
const active = ref<PanelId>(readPersistedPanel(window.localStorage, props.patternId, mode.value));

/** Follow the project and the tab kind: each mode remembers its own section. */
watch([() => props.patternId, mode], () => {
  active.value = readPersistedPanel(window.localStorage, props.patternId, mode.value);
});

const activePanel = computed(() => {
  const panel = panels.value.find((candidate) => candidate.id === active.value);
  /* v8 ignore next -- the active id always belongs to the current mode's panels */
  return panel ?? panels.value[0]!;
});
const activeCount = computed(() => countFor(activePanel.value.id));

/** One section's badge count; zero and absent are the same. */
function countFor(id: PanelId): number {
  return props.counts?.[id] ?? 0;
}

/** Rail entries carry their count and the two label forms the trigger needs. */
const railPanels = computed(() =>
  panels.value.map((panel) => {
    const count = countFor(panel.id);
    return {
      ...panel,
      count,
      tooltip: count > 0 ? `${panel.label} · ${count}` : panel.label,
      accessible: count > 0 ? `${panel.label}, ${count} items` : panel.label,
    };
  }),
);

function selectPanel(id: PanelId): void {
  active.value = id;
  writePersistedPanel(window.localStorage, props.patternId, mode.value, id);
  if (props.collapsed) emit('update:collapsed', false);
}

const resizing = ref(false);
const startX = ref(0);
const startWidth = ref(0);

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
      id="sidebar"
      class="flex h-full min-h-0 border-l bg-background"
      :style="collapsed ? undefined : { width: `${width + RAIL_WIDTH}px` }"
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

      <nav
        class="flex w-10 shrink-0 flex-col items-center overflow-visible border-r bg-background py-1"
        aria-label="Sidebar sections"
        data-testid="sidebar-rail"
      >
        <Tooltip v-for="panel in railPanels" :key="panel.id">
          <TooltipTrigger as-child>
            <button
              type="button"
              class="relative my-0.5 flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :class="
                active === panel.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              "
              :aria-pressed="active === panel.id"
              :aria-label="panel.accessible"
              :data-testid="`sidebar-tab-${panel.id}`"
              @click="selectPanel(panel.id)"
            >
              <RibbonIcon :icon="ribbonIcon(panel.icon)" :size="15" />
              <span
                v-if="panel.count > 0"
                class="absolute -bottom-0.5 -right-0.5 rounded-sm px-1 text-[8px] leading-3 tabular-nums"
                :class="
                  active === panel.id
                    ? 'bg-primary/15 text-primary'
                    : 'bg-accent text-muted-foreground'
                "
                :data-testid="`sidebar-tab-count-${panel.id}`"
              >
                {{ panel.count }}
              </span>
              <span
                v-if="active === panel.id"
                class="absolute -right-1 bottom-1.5 top-1.5 w-0.5 rounded-full bg-primary"
                aria-hidden="true"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>{{ panel.tooltip }}</TooltipContent>
        </Tooltip>

        <div class="flex-1" />
      </nav>

      <div
        v-if="!collapsed"
        class="flex h-full min-h-0 flex-1 flex-col"
        data-testid="sidebar-panel"
      >
        <div class="flex items-baseline gap-1.5 border-b px-3 py-2">
          <span
            class="text-2xs font-medium tracking-wide text-muted-foreground uppercase"
            data-testid="sidebar-panel-title"
          >
            {{ activePanel.label }}
          </span>
          <span
            v-if="activeCount > 0"
            class="text-2xs font-medium tabular-nums text-muted-foreground"
            data-testid="sidebar-panel-count"
          >
            {{ activeCount }}
          </span>
        </div>

        <ScrollArea class="min-h-0 flex-1">
          <div class="px-3 py-3">
            <fieldset class="contents" :disabled="readOnly">
              <slot :name="active" />
            </fieldset>
          </div>
        </ScrollArea>

        <slot v-if="$slots.stats" name="stats" />
      </div>
    </aside>
  </TooltipProvider>
</template>
