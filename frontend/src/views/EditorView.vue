<script setup lang="ts">
import type { Command, EntityId } from '@sewcraft/geometry';
import { onBeforeUnmount, onMounted, ref } from 'vue';

import PatternCanvas from '@/components/PatternCanvas.vue';
import { Button } from '@/components/ui/button';
import { useCommandBus } from '@/composables/use-command-bus';
import { nextCommandId } from '@/lib/command-ids';
import { EDITOR_TOOLS, type EditorTool } from '@/lib/editor-tools';

const props = defineProps<{ id: string }>();

const { document: pattern, journal, canUndo, canRedo, dispatch, undo, redo } = useCommandBus();

const error = ref<string | null>(null);
const activeTool = ref<EditorTool>('select');
const selectedId = ref<EntityId | null>(null);
const fitToken = ref(0);

function run(action: () => void): void {
  try {
    error.value = null;
    action();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Command failed';
  }
}

function selectTool(tool: EditorTool): void {
  activeTool.value = tool;
}

function fit(): void {
  fitToken.value += 1;
}

function deleteSelected(): void {
  const id = selectedId.value;
  if (id === null) return;

  run(() => dispatch({ id: nextCommandId('delete'), type: 'delete_entity', params: { id } }));
  selectedId.value = null;
}

function onMovePoint(id: EntityId, x: number, y: number): void {
  run(() => dispatch({ id: nextCommandId('move'), type: 'move_point', params: { id, x, y } }));
}

function onAddPoint(x: number, y: number): void {
  run(() => dispatch({ id: nextCommandId('point'), type: 'add_point', params: { x, y } }));
}

function onAddLine(start: EntityId, end: EntityId): void {
  run(() => dispatch({ id: nextCommandId('line'), type: 'add_line', params: { start, end } }));
}

function onAddCurve(points: [EntityId, EntityId, EntityId, EntityId]): void {
  run(() =>
    dispatch({
      id: nextCommandId('curve'),
      type: 'add_curve',
      params: { p0: points[0], p1: points[1], p2: points[2], p3: points[3] },
    }),
  );
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    deleteSelected();
  }
}

function seed(): void {
  const commands: Command[] = [
    { id: 'a', type: 'add_point', params: { x: 60, y: 260 } },
    { id: 'b', type: 'add_point', params: { x: 220, y: 260 } },
    { id: 'c', type: 'add_point', params: { x: 220, y: 170 } },
    { id: 'd', type: 'add_point', params: { x: 60, y: 170 } },
    { id: 'ab', type: 'add_line', params: { start: 'a', end: 'b' } },
    { id: 'bc', type: 'add_line', params: { start: 'b', end: 'c' } },
    { id: 'cd', type: 'add_line', params: { start: 'c', end: 'd' } },
    { id: 'da', type: 'add_line', params: { start: 'd', end: 'a' } },
    { id: 'bottom', type: 'add_constraint', params: { type: 'horizontal', entities: ['a', 'b'] } },
    { id: 'right', type: 'add_constraint', params: { type: 'vertical', entities: ['b', 'c'] } },
    { id: 'top', type: 'add_constraint', params: { type: 'horizontal', entities: ['c', 'd'] } },
    { id: 'left', type: 'add_constraint', params: { type: 'vertical', entities: ['d', 'a'] } },
    {
      id: 'width',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['a', 'b'], value: 160 },
    },
    {
      id: 'height',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['b', 'c'], value: 90 },
    },
  ];
  run(() => commands.forEach((command) => dispatch(command)));
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);

  if (pattern.value.entities.length === 0 && journal.value.length === 0) {
    seed();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="text-2xl font-semibold">Editor</h1>
      <p class="text-sm text-muted-foreground">Project #{{ props.id }}</p>
    </div>

    <p class="text-sm text-muted-foreground">
      Every edit is a command: dragging, drawing and deleting all go through the command bus, so
      undo and redo replay the journal. The solver rebuilds after each change and constraints hold.
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-1 rounded-md border p-1">
        <Button
          v-for="tool in EDITOR_TOOLS"
          :key="tool.id"
          :variant="activeTool === tool.id ? 'default' : 'ghost'"
          size="sm"
          :data-testid="`tool-${tool.id}`"
          @click="selectTool(tool.id)"
        >
          {{ tool.label }}
        </Button>
      </div>

      <Button variant="outline" size="sm" :disabled="!canUndo" @click="run(undo)">Undo</Button>
      <Button variant="outline" size="sm" :disabled="!canRedo" @click="run(redo)">Redo</Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="selectedId === null"
        data-testid="delete"
        @click="deleteSelected"
      >
        Delete
      </Button>
      <Button variant="outline" size="sm" data-testid="fit" @click="fit">Fit</Button>

      <span class="text-sm text-muted-foreground">{{ journal.length }} command(s)</span>
    </div>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <PatternCanvas
      v-model:selected-id="selectedId"
      :document="pattern"
      :tool="activeTool"
      :fit-token="fitToken"
      @move-point="onMovePoint"
      @add-point="onAddPoint"
      @add-line="onAddLine"
      @add-curve="onAddCurve"
    />
  </section>
</template>
