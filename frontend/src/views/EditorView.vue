<script setup lang="ts">
import { distance, solve, type Constraint, type PointEntity } from '@sewcraft/geometry';
import { computed } from 'vue';
import { ref } from 'vue';

const props = defineProps<{ id: string }>();

const width = ref(160);
const height = ref(90);

const points = computed<PointEntity[]>(() => [
  { id: 'a', kind: 'point', x: 60, y: 260, construction: false, fixed: true },
  { id: 'b', kind: 'point', x: 60 + width.value, y: 260, construction: false, fixed: false },
  {
    id: 'c',
    kind: 'point',
    x: 60 + width.value,
    y: 260 - height.value,
    construction: false,
    fixed: false,
  },
  { id: 'd', kind: 'point', x: 60, y: 260 - height.value, construction: false, fixed: false },
]);

const constraints = computed<Constraint[]>(() => [
  { id: 'bottom', type: 'horizontal', a: 'a', b: 'b' },
  { id: 'right', type: 'vertical', a: 'b', b: 'c' },
  { id: 'top', type: 'horizontal', a: 'c', b: 'd' },
  { id: 'left', type: 'vertical', a: 'd', b: 'a' },
  { id: 'bottom-width', type: 'distance', a: 'a', b: 'b', value: width.value },
  { id: 'right-height', type: 'distance', a: 'b', b: 'c', value: height.value },
]);

const solution = computed(() => solve(points.value, constraints.value));

const corners = computed(() => {
  const coordinates = solution.value.coordinates;
  return ['a', 'b', 'c', 'd']
    .map((id) => coordinates.get(id))
    .filter((point): point is { x: number; y: number } => point !== undefined);
});

const outline = computed(() => corners.value.map((point) => `${point.x},${point.y}`).join(' '));

const diagonal = computed(() => {
  const [a, , c] = corners.value;
  return a && c ? distance(a, c) : 0;
});
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="text-2xl font-semibold">Editor</h1>
      <p class="text-sm text-muted-foreground">Project #{{ props.id }}</p>
    </div>

    <p class="text-sm text-muted-foreground">
      Scaffold preview. A rectangle is driven purely by constraints — change a dimension and the
      solver rebuilds it.
    </p>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="space-y-1 text-sm">
        <span class="font-medium">Width (mm)</span>
        <input v-model.number="width" type="range" min="40" max="320" class="w-full" />
      </label>
      <label class="space-y-1 text-sm">
        <span class="font-medium">Height (mm)</span>
        <input v-model.number="height" type="range" min="40" max="240" class="w-full" />
      </label>
    </div>

    <svg
      viewBox="0 0 400 320"
      class="h-80 w-full rounded-md border bg-muted/30"
      role="img"
      aria-label="Solved pattern preview"
    >
      <polygon :points="outline" fill="none" stroke="currentColor" stroke-width="2" />
      <circle
        v-for="(point, index) in corners"
        :key="index"
        :cx="point.x"
        :cy="point.y"
        r="3"
        fill="currentColor"
      />
    </svg>

    <dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
      <div>
        <dt class="text-muted-foreground">Converged</dt>
        <dd class="font-medium">{{ solution.converged ? 'yes' : 'no' }}</dd>
      </div>
      <div>
        <dt class="text-muted-foreground">Iterations</dt>
        <dd class="font-medium">{{ solution.iterations }}</dd>
      </div>
      <div>
        <dt class="text-muted-foreground">Diagonal (mm)</dt>
        <dd class="font-medium">{{ diagonal.toFixed(2) }}</dd>
      </div>
    </dl>
  </section>
</template>
