<script setup lang="ts">
import type { DerivedDistanceConstraint, DistanceConstraint, EntityId } from '@sewcraft/geometry';

import type { DerivedDimensionDrawing, DimensionDrawing } from '@/lib/pattern-canvas-dimensions';

defineProps<{
  drawings: DimensionDrawing[];
  derivedDrawings: DerivedDimensionDrawing[];
  marqueeDimensionCandidates: ReadonlySet<EntityId>;
}>();

const emit = defineEmits<{
  'pointer-down': [constraint: DistanceConstraint | DerivedDistanceConstraint, event: PointerEvent];
}>();
</script>

<template>
  <g
    v-for="drawing in drawings"
    :key="drawing.id"
    class="pointer-events-none"
    :data-testid="`dimension-lines-${drawing.id}`"
    :data-dimension-id="drawing.id"
    :data-selected="drawing.selected ? 'true' : 'false'"
  >
    <template v-for="segment in drawing.segments" :key="segment.key">
      <line
        v-if="segment.main && (drawing.selected || marqueeDimensionCandidates.has(drawing.id))"
        :x1="segment.x1"
        :y1="segment.y1"
        :x2="segment.x2"
        :y2="segment.y2"
        :class="drawing.selected ? 'stroke-primary opacity-30' : 'stroke-primary opacity-20'"
        stroke-width="4"
        vector-effect="non-scaling-stroke"
        :data-testid="drawing.selected ? 'dimension-selection-halo' : 'dimension-marquee-preview'"
      />
      <line
        :x1="segment.x1"
        :y1="segment.y1"
        :x2="segment.x2"
        :y2="segment.y2"
        :class="
          drawing.preview
            ? 'stroke-primary'
            : segment.main
              ? 'stroke-foreground'
              : 'stroke-muted-foreground'
        "
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
    </template>
    <line
      v-if="drawing.draggable"
      :x1="drawing.layout.dimensionStart.x"
      :y1="drawing.layout.dimensionStart.y"
      :x2="drawing.layout.dimensionEnd.x"
      :y2="drawing.layout.dimensionEnd.y"
      stroke="transparent"
      stroke-width="24"
      vector-effect="non-scaling-stroke"
      class="pointer-events-auto cursor-move"
      :data-testid="`dimension-drag-${drawing.id}`"
      @pointerdown.left.stop="emit('pointer-down', drawing.constraint, $event)"
    />
  </g>

  <g
    v-for="drawing in derivedDrawings"
    :key="`derived-${drawing.id}`"
    class="pointer-events-none"
    :data-testid="`dimension-lines-${drawing.id}`"
    :data-dimension-id="drawing.id"
    :data-dimension-derived="drawing.id"
    :data-selected="drawing.selected ? 'true' : 'false'"
  >
    <template v-for="segment in drawing.segments" :key="segment.key">
      <line
        v-if="segment.main && (drawing.selected || marqueeDimensionCandidates.has(drawing.id))"
        :x1="segment.x1"
        :y1="segment.y1"
        :x2="segment.x2"
        :y2="segment.y2"
        :class="drawing.selected ? 'stroke-primary opacity-30' : 'stroke-primary opacity-20'"
        stroke-width="4"
        vector-effect="non-scaling-stroke"
        :data-testid="drawing.selected ? 'dimension-selection-halo' : 'dimension-marquee-preview'"
      />
      <line
        :x1="segment.x1"
        :y1="segment.y1"
        :x2="segment.x2"
        :y2="segment.y2"
        :class="
          drawing.preview && segment.main
            ? 'stroke-primary'
            : segment.main
              ? 'stroke-dimension-derived'
              : 'stroke-muted-foreground'
        "
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
    </template>
    <line
      v-if="drawing.draggable"
      :x1="drawing.layout.dimensionStart.x"
      :y1="drawing.layout.dimensionStart.y"
      :x2="drawing.layout.dimensionEnd.x"
      :y2="drawing.layout.dimensionEnd.y"
      stroke="transparent"
      stroke-width="24"
      vector-effect="non-scaling-stroke"
      class="pointer-events-auto cursor-move"
      :data-testid="`dimension-drag-${drawing.id}`"
      @pointerdown.left.stop="emit('pointer-down', drawing.constraint, $event)"
    />
  </g>
</template>
