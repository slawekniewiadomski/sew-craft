<script setup lang="ts">
import type { Command, LineEntity, PointEntity } from '@sewcraft/geometry';
import { computed, onMounted, ref } from 'vue';

import { Button } from '@/components/ui/button';
import { useCommandBus } from '@/composables/useCommandBus';

const props = defineProps<{ id: string }>();

const { document: pattern, journal, canUndo, canRedo, dispatch, undo, redo } = useCommandBus();

const error = ref<string | null>(null);
let nextPointId = 0;

const points = computed(() =>
  pattern.value.entities.filter((entity): entity is PointEntity => entity.kind === 'point'),
);

const segments = computed(() => {
  const byId = new Map(points.value.map((point) => [point.id, point]));
  return pattern.value.entities
    .filter((entity): entity is LineEntity => entity.kind === 'line')
    .flatMap((line) => {
      const start = byId.get(line.start);
      const end = byId.get(line.end);
      return start && end ? [{ id: line.id, start, end, construction: line.construction }] : [];
    });
});

function run(action: () => void): void {
  try {
    error.value = null;
    action();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Command failed';
  }
}

function addPoint(): void {
  const id = `point-${nextPointId++}`;
  run(() =>
    dispatch({ id, type: 'add_point', params: { x: 40 + (nextPointId % 8) * 16, y: 300 } }),
  );
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
  if (pattern.value.entities.length === 0 && journal.value.length === 0) {
    seed();
  }
});
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="text-2xl font-semibold">Editor</h1>
      <p class="text-sm text-muted-foreground">Project #{{ props.id }}</p>
    </div>

    <p class="text-sm text-muted-foreground">
      Every edit is a command: the document below is only ever changed through the command bus, so
      undo and redo replay the journal.
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" :disabled="!canUndo" @click="run(undo)">Undo</Button>
      <Button variant="outline" size="sm" :disabled="!canRedo" @click="run(redo)">Redo</Button>
      <Button size="sm" @click="addPoint">Add point</Button>
      <span class="text-sm text-muted-foreground">{{ journal.length }} command(s)</span>
    </div>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <svg
      viewBox="0 0 400 320"
      class="h-80 w-full rounded-md border bg-muted/30"
      role="img"
      aria-label="Command-driven pattern preview"
    >
      <line
        v-for="segment in segments"
        :key="segment.id"
        :x1="segment.start.x"
        :y1="segment.start.y"
        :x2="segment.end.x"
        :y2="segment.end.y"
        :stroke-dasharray="segment.construction ? '4 4' : undefined"
        stroke="currentColor"
        stroke-width="2"
      />
      <circle
        v-for="point in points"
        :key="point.id"
        :cx="point.x"
        :cy="point.y"
        r="3"
        fill="currentColor"
      />
    </svg>
  </section>
</template>
