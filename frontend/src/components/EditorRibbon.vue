<script setup lang="ts">
import { computed } from 'vue';

import { Button, type ButtonVariant } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ConstraintType } from '@sewcraft/geometry';

import {
  ASSEMBLY_RIBBON_GROUPS,
  RIBBON_GROUPS,
  type RibbonAction,
  type RibbonItem,
  type RibbonToolGroupItem,
} from '@/lib/editor-ribbon';
import type { EditorTool } from '@/lib/editor-tools';
import { ribbonIcon } from '@/lib/ribbon-icons';
import RibbonIcon from './RibbonIcon.vue';
import RibbonToolGroup from './RibbonToolGroup.vue';

type RibbonButtonItem = Exclude<RibbonItem, RibbonToolGroupItem>;

const props = withDefaults(
  defineProps<{
    activeTool: EditorTool;
    /** The piece tab shows the sketch ribbon; an assembly tab shows its own. */
    mode?: 'piece' | 'assembly';
    activeConstraint?: ConstraintType | null;
    canUndo: boolean;
    canRedo: boolean;
    canDelete: boolean;
    /** A read-only document disables every tool and action. */
    readOnly?: boolean;
    /** Whether the active piece can be exported. */
    canExport?: boolean;
    /** Explains a refused export, shown in its tooltip. */
    exportHint?: string;
    /** The one collapse control mirrors the sidebar it owns. */
    sidebarCollapsed?: boolean;
  }>(),
  {
    mode: 'piece',
    readOnly: false,
    canExport: true,
    exportHint: undefined,
    sidebarCollapsed: false,
  },
);

const groups = computed(() => (props.mode === 'assembly' ? ASSEMBLY_RIBBON_GROUPS : RIBBON_GROUPS));

const emit = defineEmits<{
  'select-tool': [tool: EditorTool];
  'select-constraint': [constraint: ConstraintType];
  action: [action: RibbonAction];
  'toggle-sidebar': [];
}>();

function isActive(item: RibbonItem): boolean {
  if (item.kind === 'tool') {
    return props.activeConstraint == null && props.activeTool === item.tool;
  }
  if (item.kind === 'constraint') {
    return props.activeConstraint === item.constraint;
  }
  if (item.kind === 'tool-group') {
    return (
      props.activeConstraint == null &&
      item.items.some((member) => member.tool === props.activeTool)
    );
  }
  return false;
}

function variantFor(item: RibbonButtonItem): ButtonVariant {
  if (item.kind === 'action') return 'outline';
  return isActive(item) ? 'default' : 'ghost';
}

function isDisabled(item: RibbonButtonItem): boolean {
  if (props.readOnly) {
    // Read-only keeps the view actions that do not mutate: fit, and export when
    // the active piece can still be written.
    if (item.kind !== 'action') return true;
    if (item.action === 'fit') return false;
    if (item.action === 'download_svg') return !props.canExport;
    return true;
  }
  if (item.kind !== 'action') return false;
  switch (item.action) {
    case 'undo':
      return !props.canUndo;
    case 'redo':
      return !props.canRedo;
    case 'delete':
      return !props.canDelete;
    case 'download_svg':
      return !props.canExport;
    case 'mirror_instance':
    case 'rotate_instance':
      return !props.canDelete;
    default:
      return false;
  }
}

function pressed(item: RibbonButtonItem): true | undefined {
  return isActive(item) ? true : undefined;
}

/** The tooltip text: an action's own label, or the reason it is refused. */
function hintFor(item: RibbonButtonItem): string {
  if (item.kind !== 'action') return item.label;
  if (item.action === 'download_svg' && !props.canExport && props.exportHint) {
    return props.exportHint;
  }
  return item.label;
}

function activate(item: RibbonButtonItem): void {
  if (item.kind === 'tool') {
    emit('select-tool', item.tool);
  } else if (item.kind === 'constraint') {
    emit('select-constraint', item.constraint);
  } else {
    emit('action', item.action);
  }
}
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div
      class="flex items-start gap-1 border-b bg-background px-2 py-1"
      data-testid="editor-ribbon"
    >
      <div
        class="flex min-w-0 flex-1 flex-wrap items-start gap-1"
        role="toolbar"
        aria-label="Editor tools"
      >
        <template v-for="(group, index) in groups" :key="group.id">
          <Separator v-if="index > 0" orientation="vertical" class="mx-1" />
          <div class="flex flex-col gap-1" :aria-label="group.label" role="group">
            <span
              class="pl-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider text-muted-foreground"
              aria-hidden="true"
              :data-testid="`ribbon-group-${group.id}-label`"
            >
              {{ group.label }}
            </span>
            <div class="flex items-center gap-1">
              <template v-for="item in group.items" :key="item.id">
                <RibbonToolGroup
                  v-if="item.kind === 'tool-group'"
                  :item="item"
                  :active-tool="activeTool"
                  :active="isActive(item)"
                  :read-only="readOnly"
                  @select-tool="emit('select-tool', $event)"
                />
                <Tooltip v-else>
                  <TooltipTrigger as-child>
                    <Button
                      :variant="variantFor(item)"
                      size="icon"
                      :data-testid="item.id"
                      :disabled="isDisabled(item)"
                      :aria-label="item.label"
                      :aria-pressed="pressed(item)"
                      @click="activate(item)"
                    >
                      <RibbonIcon :icon="ribbonIcon(item.icon)" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ hintFor(item) }}</TooltipContent>
                </Tooltip>
              </template>
            </div>
          </div>
        </template>
      </div>

      <div class="flex shrink-0 items-center gap-1 self-center">
        <Separator orientation="vertical" class="mx-1" />
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
              :aria-expanded="!sidebarCollapsed"
              aria-controls="sidebar"
              data-testid="sidebar-toggle"
              @click="emit('toggle-sidebar')"
            >
              <RibbonIcon
                :icon="ribbonIcon('chevron-down')"
                :class="sidebarCollapsed ? 'rotate-90' : '-rotate-90'"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{
            sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
          }}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  </TooltipProvider>
</template>
