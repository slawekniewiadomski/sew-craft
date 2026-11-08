<script setup lang="ts">
import type { EntityId, PointEntity } from '@sewcraft/geometry';

import type { DimensionPick } from '@/lib/dimension-feedback';

defineProps<{
  featurePoints: PointEntity[];
  featurePointClass: (point: PointEntity) => string;
  points: PointEntity[];
  pointClass: (point: PointEntity) => string;
  selectedIds: ReadonlySet<EntityId>;
  dimensionCandidatePointIds: ReadonlySet<EntityId>;
  cutCandidatePointIds: ReadonlySet<EntityId>;
  dimensionFirstPick: DimensionPick | null;
  dimensionToolArmed: boolean;
  roundCornerActive: boolean;
  viewportScale: number;
}>();
</script>

<template>
  <g data-testid="corner-round-feature-layer" aria-hidden="true">
    <circle
      v-for="point in featurePoints"
      :key="`feature-${point.id}`"
      :cx="point.x"
      :cy="point.y"
      r="3"
      stroke-width="1"
      :class="featurePointClass(point)"
      :data-entity-id="point.id"
      data-kind="point"
      :data-testid="`corner-round-feature-${point.id}`"
    />
  </g>

  <g v-for="point in points" :key="point.id">
    <circle
      :cx="point.x"
      :cy="point.y"
      r="4"
      stroke-width="1"
      :class="pointClass(point)"
      :data-entity-id="point.id"
      data-kind="point"
      :data-dimension-candidate="dimensionCandidatePointIds.has(point.id) ? 'true' : undefined"
      :data-cut-dimension-candidate="cutCandidatePointIds.has(point.id) ? 'true' : undefined"
      :data-dimension-first-pick="
        dimensionFirstPick?.kind === 'point' && dimensionFirstPick.id === point.id
          ? 'true'
          : undefined
      "
    />
    <circle
      v-if="dimensionToolArmed"
      :cx="point.x"
      :cy="point.y"
      :r="6 / viewportScale"
      fill="transparent"
      :data-entity-id="point.id"
      data-kind="point"
      data-testid="dimension-hit-target"
    />
    <circle
      v-if="roundCornerActive"
      :cx="point.x"
      :cy="point.y"
      r="6"
      fill="transparent"
      :data-entity-id="point.id"
      data-kind="point"
      data-testid="round-corner-point-target"
    />
    <circle
      v-if="selectedIds.has(point.id)"
      :cx="point.x"
      :cy="point.y"
      r="7"
      class="fill-none stroke-primary"
      stroke-width="1.5"
      data-testid="selection-handle"
    />
  </g>
</template>
