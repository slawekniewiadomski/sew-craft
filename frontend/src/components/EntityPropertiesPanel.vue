<script setup lang="ts">
import type {
  DimensionOrientation,
  Entity,
  EntityId,
  PatternDocument,
  SeamSide,
} from '@sewcraft/geometry';
import { computed } from 'vue';

import { Button } from '@/components/ui/button';
import type { DimensionSummary, EntityProperties } from '@/lib/entity-properties';
import {
  DIMENSION_ORIENTATION_OPTIONS,
  formatDimensionValue,
  parseDimensionEdit,
} from '@/lib/dimensions';
import { parseSeamWidth } from '@/lib/seam-width';

const props = defineProps<{
  /** The live document; the panel never copies it, every render re-reads props. */
  document: PatternDocument;
  entity: EntityProperties;
}>();

const emit = defineEmits<{
  'set-construction': [id: EntityId, construction: boolean];
  'add-seam': [id: EntityId];
  'set-seam-width': [id: EntityId, width: number];
  'flip-seam': [id: EntityId, side: SeamSide];
  'remove-seam': [id: EntityId];
  'update-dimension': [id: EntityId, value: number | null];
  'remove-constraint': [id: EntityId];
}>();

const KIND_LABELS: Record<Entity['kind'], string> = {
  point: 'Point',
  line: 'Line',
  curve: 'Curve',
};

const KIND_NOUNS: Record<Entity['kind'], string> = {
  point: 'point',
  line: 'line',
  curve: 'curve',
};

const kindNoun = computed(() => KIND_NOUNS[props.entity.kind]);

function kindLabel(kind: Entity['kind']): string {
  return KIND_LABELS[kind];
}

function orientationLabel(orientation: DimensionOrientation): string {
  return DIMENSION_ORIENTATION_OPTIONS.find((option) => option.value === orientation)!.label;
}

function lengthText(length: number | null): string {
  return length === null ? '—' : `${formatDimensionValue(length)} mm`;
}

function onConstructionChange(event: Event): void {
  emit('set-construction', props.entity.id, (event.target as HTMLInputElement).checked);
}

/** An invalid or unchanged width snaps back without emitting a command. */
function onSeamWidthEdit(id: EntityId, current: number, event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseSeamWidth(input.value);
  if (width === null || width === current) {
    input.value = String(current);
    return;
  }

  emit('set-seam-width', id, width);
}

/** Millimetre text for a dimension, or empty when it cannot be measured. */
function dimensionValueText(value: number | null): string {
  return value === null ? '' : formatDimensionValue(value);
}

/** Empty text clears the value back to driven; invalid or unchanged text snaps back. */
function onDimensionValueEdit(dimension: DimensionSummary, event: Event): void {
  const input = event.target as HTMLInputElement;
  const edit = parseDimensionEdit(input.value);
  const unchanged =
    edit.kind === 'invalid'
      ? true
      : edit.kind === 'driven'
        ? dimension.driven
        : !dimension.driven && edit.value === dimension.value;

  if (edit.kind === 'invalid' || unchanged) {
    input.value = dimensionValueText(dimension.value);
    return;
  }

  emit('update-dimension', dimension.id, edit.kind === 'driven' ? null : edit.value);
}
</script>

<template>
  <section
    class="space-y-3 text-sm"
    aria-labelledby="entity-properties-heading"
    data-testid="entity-properties"
  >
    <header class="flex flex-wrap items-center gap-2">
      <h2 id="entity-properties-heading" class="font-semibold">
        {{ kindLabel(props.entity.kind) }}
        <span class="font-mono text-muted-foreground">{{ props.entity.id }}</span>
      </h2>
      <span
        v-if="props.entity.construction"
        class="rounded-sm border px-1 text-xs text-muted-foreground"
      >
        Construction
      </span>
    </header>

    <p
      v-if="props.entity.geometry.kind !== 'point'"
      class="text-xs text-muted-foreground"
      data-testid="entity-scope-hint"
    >
      Showing what acts on this {{ kindNoun }}. Select a point to see its constraints.
    </p>

    <section aria-labelledby="entity-geometry-heading">
      <h3
        id="entity-geometry-heading"
        class="text-xs font-semibold uppercase text-muted-foreground"
      >
        Geometry
      </h3>
      <dl class="mt-1 space-y-1">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Kind</dt>
          <dd data-testid="entity-kind">{{ kindLabel(props.entity.kind) }}</dd>
        </div>

        <template v-if="props.entity.geometry.kind === 'point'">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">X</dt>
            <dd>{{ formatDimensionValue(props.entity.geometry.x) }} mm</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Y</dt>
            <dd>{{ formatDimensionValue(props.entity.geometry.y) }} mm</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Fixed</dt>
            <dd data-testid="entity-fixed">{{ props.entity.fixed ? 'Yes' : 'No' }}</dd>
          </div>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'line'">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Start</dt>
            <dd class="font-mono">{{ props.entity.geometry.start }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">End</dt>
            <dd class="font-mono">{{ props.entity.geometry.end }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Length</dt>
            <dd data-testid="entity-length">{{ lengthText(props.entity.length) }}</dd>
          </div>
        </template>

        <template v-else>
          <div
            v-for="point in ['p0', 'p1', 'p2', 'p3'] as const"
            :key="point"
            class="flex items-center justify-between gap-2"
          >
            <dt class="uppercase text-muted-foreground">{{ point }}</dt>
            <dd class="font-mono">{{ props.entity.geometry[point] }}</dd>
          </div>
        </template>

        <div class="flex items-center justify-between gap-2">
          <label :for="`entity-construction-${props.entity.id}`" class="text-muted-foreground">
            Construction
          </label>
          <input
            :id="`entity-construction-${props.entity.id}`"
            type="checkbox"
            :checked="props.entity.construction"
            :aria-label="`Construction for ${props.entity.id}`"
            data-testid="entity-construction"
            @change="onConstructionChange"
          />
        </div>
      </dl>
    </section>

    <section aria-labelledby="entity-dimensions-heading">
      <h3
        id="entity-dimensions-heading"
        class="text-xs font-semibold uppercase text-muted-foreground"
      >
        Dimensions
      </h3>
      <ul
        v-if="props.entity.dimensions.length > 0"
        class="mt-1 space-y-2"
        :aria-label="`Dimensions for ${props.entity.id}`"
      >
        <li
          v-for="dimension in props.entity.dimensions"
          :key="dimension.id"
          class="space-y-1"
          :data-testid="`entity-dimension-${dimension.id}`"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <span class="font-mono text-muted-foreground">{{ dimension.id }}</span>
              <span class="ml-2 text-xs text-muted-foreground">
                {{ orientationLabel(dimension.orientation) }} · {{ dimension.entities.join(', ') }}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              :aria-label="`Remove dimension ${dimension.id}`"
              :data-testid="`entity-remove-dimension-${dimension.id}`"
              @click="emit('remove-constraint', dimension.id)"
            >
              Remove
            </Button>
          </div>

          <label class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted-foreground">Value</span>
            <input
              type="number"
              min="0.001"
              step="0.1"
              class="w-20 rounded-md border px-2 py-1"
              :value="dimensionValueText(dimension.value)"
              :aria-label="`Value for dimension ${dimension.id} on ${props.entity.id}`"
              :data-testid="`entity-dimension-value-${dimension.id}`"
              @change="onDimensionValueEdit(dimension, $event)"
            />
            <span class="text-xs text-muted-foreground">mm</span>
            <span
              class="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
              :data-testid="`entity-dimension-state-${dimension.id}`"
            >
              {{ dimension.driven ? 'Driven' : 'Set' }}
            </span>
          </label>
        </li>
      </ul>
      <p v-else class="mt-1 text-xs text-muted-foreground">No dimensions on this {{ kindNoun }}.</p>
    </section>

    <section aria-labelledby="entity-constraints-heading">
      <h3
        id="entity-constraints-heading"
        class="text-xs font-semibold uppercase text-muted-foreground"
      >
        Constraints
      </h3>
      <ul
        v-if="props.entity.constraints.length > 0"
        class="mt-1 space-y-2"
        :aria-label="`Constraints for ${props.entity.id}`"
      >
        <li
          v-for="constraint in props.entity.constraints"
          :key="constraint.id"
          class="flex flex-wrap items-center justify-between gap-2"
          :data-testid="`entity-constraint-${constraint.id}`"
        >
          <div class="min-w-0">
            <span class="font-mono text-muted-foreground">{{ constraint.id }}</span>
            <span class="ml-2">{{ constraint.label }}</span>
            <span class="ml-2 text-xs text-muted-foreground">
              ({{ constraint.entities.join(', ') }})
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            :aria-label="`Remove constraint ${constraint.id}`"
            :data-testid="`entity-remove-constraint-${constraint.id}`"
            @click="emit('remove-constraint', constraint.id)"
          >
            Remove
          </Button>
        </li>
      </ul>
      <p v-else class="mt-1 text-xs text-muted-foreground">
        No constraints on this {{ kindNoun }}.
      </p>
    </section>

    <section
      v-if="props.entity.geometry.kind !== 'point'"
      aria-labelledby="entity-seam-heading"
      data-testid="entity-seam"
    >
      <h3 id="entity-seam-heading" class="text-xs font-semibold uppercase text-muted-foreground">
        Seam allowance
      </h3>

      <div v-if="props.entity.seam" class="mt-1 flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-1 text-muted-foreground">
          Allowance
          <input
            type="number"
            min="0.1"
            step="0.1"
            class="w-16 rounded-md border px-2 py-1 text-sm text-foreground"
            :value="props.entity.seam.width"
            :aria-label="`Allowance width in millimetres for ${props.entity.id}`"
            data-testid="entity-seam-width"
            @change="onSeamWidthEdit(props.entity.seam!.id, props.entity.seam!.width, $event)"
            @keydown.enter.prevent="
              onSeamWidthEdit(props.entity.seam!.id, props.entity.seam!.width, $event)
            "
          />
          mm
        </label>
        <Button
          variant="outline"
          size="sm"
          :aria-label="`Flip side of the seam allowance for ${props.entity.id}`"
          data-testid="entity-flip-seam"
          @click="emit('flip-seam', props.entity.seam!.id, props.entity.seam!.side)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8" />
            <path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13" />
          </svg>
          Flip side
        </Button>
        <Button
          variant="outline"
          size="sm"
          :aria-label="`Remove allowance from ${props.entity.id}`"
          data-testid="entity-remove-seam"
          @click="emit('remove-seam', props.entity.seam!.id)"
        >
          Remove
        </Button>
      </div>

      <p
        v-else-if="props.entity.construction"
        class="mt-1 text-xs text-muted-foreground"
        data-testid="entity-seam-construction"
      >
        Allowances apply to cut edges only.
      </p>

      <Button
        v-else
        variant="outline"
        size="sm"
        class="mt-1"
        :aria-label="`Add allowance to ${props.entity.id}`"
        data-testid="entity-add-seam"
        @click="emit('add-seam', props.entity.id)"
      >
        Add allowance
      </Button>
    </section>
  </section>
</template>
