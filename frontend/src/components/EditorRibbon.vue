<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RIBBON_GROUPS, type RibbonAction, type RibbonItem } from '@/lib/editor-ribbon';
import type { EditorTool } from '@/lib/editor-tools';

const props = defineProps<{
  activeTool: EditorTool;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
}>();

const emit = defineEmits<{
  'select-tool': [tool: EditorTool];
  action: [action: RibbonAction];
}>();

function isActive(item: RibbonItem): boolean {
  return item.kind === 'tool' && props.activeTool === item.tool;
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
  } else {
    emit('action', item.action);
  }
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-1 border-b bg-background px-2 py-1"
    role="toolbar"
    aria-label="Editor tools"
    data-testid="editor-ribbon"
  >
    <template v-for="(group, index) in RIBBON_GROUPS" :key="group.id">
      <Separator v-if="index > 0" orientation="vertical" class="mx-1 h-6" />
      <div class="flex items-center gap-1" :aria-label="group.label" role="group">
        <Button
          v-for="item in group.items"
          :key="item.id"
          variant="ghost"
          size="sm"
          :data-testid="item.id"
          :disabled="isDisabled(item)"
          :aria-pressed="pressed(item)"
          @click="activate(item)"
        >
          {{ item.label }}
        </Button>
      </div>
    </template>
  </div>
</template>
