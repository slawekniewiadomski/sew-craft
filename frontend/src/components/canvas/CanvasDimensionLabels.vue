<script setup lang="ts">
import type { DerivedDistanceConstraint, DistanceConstraint, EntityId } from '@sewcraft/geometry';

import type {
  DerivedDimensionLabelView,
  DimensionLabelView,
} from '@/lib/pattern-canvas-dimensions';

defineProps<{
  labels: DimensionLabelView[];
  derivedLabels: DerivedDimensionLabelView[];
  labelClass: (label: DimensionLabelView) => string;
  derivedConstraint: (id: EntityId) => DerivedDistanceConstraint;
}>();

const emit = defineEmits<{
  'pointer-down': [constraint: DistanceConstraint | DerivedDistanceConstraint, event: PointerEvent];
  'double-click': [label: DimensionLabelView];
}>();
</script>

<template>
  <g class="pointer-events-none" data-testid="dimension-labels-layer">
    <g
      v-for="label in labels"
      :key="label.id"
      :class="
        label.draggable
          ? 'pointer-events-auto cursor-move'
          : label.editable
            ? 'pointer-events-auto cursor-text'
            : 'pointer-events-none'
      "
      :data-dimension-id="label.id"
      :data-testid="`dimension-label-${label.id}`"
      :data-selected="label.selected ? 'true' : 'false'"
      :transform="`translate(${label.x} ${label.y}) rotate(${label.angle})`"
      role="img"
      :aria-label="label.accessibleName"
      @pointerdown.left.stop="
        label.draggable ? emit('pointer-down', label.constraint, $event) : undefined
      "
      @dblclick.stop.prevent="emit('double-click', label)"
    >
      <title>
        {{
          label.draggable
            ? 'Click to select, drag to reposition, double-click to edit'
            : label.editable
              ? 'Double-click to edit'
              : 'Dimension preview'
        }}
      </title>
      <rect
        :x="-label.width / 2"
        y="-8"
        :width="label.width"
        height="16"
        rx="2"
        :class="label.selected ? 'fill-background stroke-primary' : 'fill-background'"
        :stroke-width="label.selected ? 2 : 0"
      />
      <text
        v-if="label.state === 'broken'"
        :x="-label.width / 2 - 6"
        y="1"
        text-anchor="end"
        dominant-baseline="middle"
        class="fill-destructive text-[11px]"
        data-testid="dimension-broken-glyph"
        aria-hidden="true"
      >
        ⚠
      </text>
      <text
        text-anchor="middle"
        dominant-baseline="middle"
        :class="[labelClass(label), 'text-[11px]']"
        :data-dimension-state="label.state"
      >
        {{ label.value }}
      </text>
    </g>

    <g
      v-for="label in derivedLabels"
      :key="`derived-${label.id}`"
      :class="label.draggable ? 'pointer-events-auto cursor-move' : 'pointer-events-none'"
      :data-dimension-id="label.id"
      :data-dimension-derived="label.id"
      :data-testid="`dimension-label-${label.id}`"
      :data-selected="label.selected ? 'true' : 'false'"
      :transform="`translate(${label.x} ${label.y}) rotate(${label.angle})`"
      role="img"
      :aria-label="label.accessibleName"
      @pointerdown.left.stop="
        label.draggable ? emit('pointer-down', derivedConstraint(label.id), $event) : undefined
      "
    >
      <title>
        {{ label.draggable ? 'Click to select, drag to reposition' : 'Cut dimension (read-only)' }}
      </title>
      <rect
        :x="-label.width / 2"
        y="-8"
        :width="label.width"
        height="16"
        rx="2"
        :class="label.selected ? 'fill-background stroke-primary' : 'fill-background'"
        :stroke-width="label.selected ? 2 : 0"
      />
      <text
        text-anchor="middle"
        dominant-baseline="middle"
        class="fill-dimension-derived text-[11px]"
        :data-dimension-state="label.state"
      >
        {{ label.value }}
      </text>
    </g>
  </g>
</template>
