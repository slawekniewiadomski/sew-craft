<script setup lang="ts">
import type { Command, CurveEntity, LineEntity, PointEntity } from '@sewcraft/geometry';
import { cutEdges } from '@sewcraft/geometry';
import { computed, onMounted, ref } from 'vue';

import { Button } from '@/components/ui/button';
import { useCommandBus } from '@/composables/use-command-bus';

const props = defineProps<{ id: string }>();

const { document: pattern, journal, canUndo, canRedo, dispatch, undo, redo } = useCommandBus();

const error = ref<string | null>(null);
const showConstruction = ref(true);
let nextPointId = 0;
let nextCommandId = 0;

/**
 * Construction geometry is presentation only: hiding it filters what is drawn
 * without touching the document, so the toggle never changes the model.
 */
const visible = computed(() =>
  showConstruction.value
    ? pattern.value.entities
    : pattern.value.entities.filter((entity) => !entity.construction),
);

const points = computed(() =>
  visible.value.filter((entity): entity is PointEntity => entity.kind === 'point'),
);

const pointById = computed(
  () =>
    new Map(
      pattern.value.entities
        .filter((entity): entity is PointEntity => entity.kind === 'point')
        .map((point) => [point.id, point]),
    ),
);

const segments = computed(() =>
  visible.value
    .filter((entity): entity is LineEntity => entity.kind === 'line')
    .flatMap((line) => {
      const start = pointById.value.get(line.start);
      const end = pointById.value.get(line.end);
      return start && end ? [{ id: line.id, start, end, construction: line.construction }] : [];
    }),
);

/** Every line and curve, so any edge can be converted between guide and cut. */
const edges = computed(() =>
  pattern.value.entities
    .filter((entity): entity is LineEntity | CurveEntity => entity.kind !== 'point')
    .map((entity) => ({ id: entity.id, construction: entity.construction })),
);

const cutEdgeCount = computed(() => cutEdges(pattern.value).length);

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

function convert(id: string, construction: boolean): void {
  run(() =>
    dispatch({
      id: `construction-${nextCommandId++}`,
      type: 'set_construction',
      params: { id, construction },
    }),
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
      <label class="flex items-center gap-1 text-sm">
        <input v-model="showConstruction" type="checkbox" />
        Show construction
      </label>
      <span class="text-sm text-muted-foreground">{{ journal.length }} command(s)</span>
      <span class="text-sm text-muted-foreground">{{ cutEdgeCount }} cut edge(s)</span>
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
        :class="segment.construction ? 'text-muted-foreground' : 'text-foreground'"
        stroke="currentColor"
        stroke-width="2"
      />
      <circle
        v-for="point in points"
        :key="point.id"
        :cx="point.x"
        :cy="point.y"
        r="3"
        :class="point.construction ? 'text-muted-foreground' : 'text-foreground'"
        :fill="point.construction ? 'none' : 'currentColor'"
        :stroke="point.construction ? 'currentColor' : 'none'"
        stroke-width="1.5"
      />
    </svg>

    <div v-if="edges.length > 0" class="space-y-2">
      <h2 class="text-sm font-medium">Edges</h2>
      <ul class="space-y-1" aria-label="Edges">
        <li
          v-for="edge in edges"
          :key="edge.id"
          class="flex items-center justify-between gap-2 text-sm"
        >
          <span class="font-mono text-muted-foreground">{{ edge.id }}</span>
          <Button variant="outline" size="sm" @click="convert(edge.id, !edge.construction)">
            {{ edge.construction ? 'Make cut edge' : 'Make construction' }}
          </Button>
        </li>
      </ul>
    </div>
  </section>
</template>
