<script setup lang="ts">
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ConstraintType } from '@sewcraft/geometry';

import { RIBBON_GROUPS, type RibbonAction, type RibbonItem } from '@/lib/editor-ribbon';
import type { EditorTool } from '@/lib/editor-tools';
import { ribbonIcon } from '@/lib/ribbon-icons';
import RibbonIcon from './RibbonIcon.vue';

const props = defineProps<{
  activeTool: EditorTool;
  activeConstraint?: ConstraintType | null;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  canCreatePiece?: boolean;
}>();

const emit = defineEmits<{
  'select-tool': [tool: EditorTool];
  'select-constraint': [constraint: ConstraintType];
  action: [action: RibbonAction];
}>();

function isActive(item: RibbonItem): boolean {
  if (item.kind === 'tool') {
    return props.activeConstraint == null && props.activeTool === item.tool;
  }
  if (item.kind === 'constraint') {
    return props.activeConstraint === item.constraint;
  }
  return false;
}

function variantFor(item: RibbonItem): ButtonVariant {
  if (item.kind === 'action') return 'outline';
  return isActive(item) ? 'default' : 'ghost';
}

function isDisabled(item: RibbonItem): boolean {
  if (item.kind !== 'action') return false;
  switch (item.action) {
    case 'undo':
      return !props.canUndo;
    case 'redo':
      return !props.canRedo;
    case 'delete':
      return !props.canDelete;
    case 'create_piece':
      return !props.canCreatePiece;
    default:
      return false;
  }
}

function pressed(item: RibbonItem): true | undefined {
  return isActive(item) ? true : undefined;
}

function activate(item: RibbonItem): void {
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
      class="flex flex-wrap items-stretch gap-1 border-b bg-background px-2 py-1"
      role="toolbar"
      aria-label="Editor tools"
      data-testid="editor-ribbon"
    >
      <template v-for="(group, index) in RIBBON_GROUPS" :key="group.id">
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
            <Tooltip v-for="item in group.items" :key="item.id">
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
              <TooltipContent>{{ item.label }}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </template>
    </div>
  </TooltipProvider>
</template>
