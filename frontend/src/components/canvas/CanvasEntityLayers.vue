<script setup lang="ts">
import type { EntityId } from '@sewcraft/geometry';

import type { DimensionPick } from '@/lib/dimension-feedback';
import type { ArcView, CircleView, CurveView, LineView } from '@/lib/pattern-canvas-views';

type ClassEntity = {
  id: EntityId;
  construction?: boolean;
  role?: 'construction' | 'annotation';
};
type DashEntity = { construction?: boolean; role?: 'construction' | 'annotation' };

const props = defineProps<{
  lines: LineView[];
  curves: CurveView[];
  arcs: ArcView[];
  circles: CircleView[];
  /** Edges a measured variable reads. */
  highlightedIds: ReadonlySet<EntityId>;
  dimensionCandidateLineIds: ReadonlySet<EntityId>;
  cutEdgeCandidateIds: ReadonlySet<EntityId>;
  dimensionFirstPick: DimensionPick | null;
  entityClass: (entity: ClassEntity) => string;
  entityDash: (entity: DashEntity) => string | undefined;
  lineWidth: (id: EntityId) => number;
}>();

const emit = defineEmits<{
  hover: [id: EntityId];
  leave: [];
  'curve-double-click': [id: EntityId, event: MouseEvent];
}>();
</script>

<template>
  <g>
    <template v-for="entry in props.lines" :key="entry.line.id">
      <line
        :x1="entry.start.x"
        :y1="entry.start.y"
        :x2="entry.end.x"
        :y2="entry.end.y"
        :class="props.entityClass(entry.line)"
        :stroke-dasharray="props.entityDash(entry.line)"
        :stroke-width="props.lineWidth(entry.line.id)"
        stroke="currentColor"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
        :data-entity-id="entry.line.id"
        data-kind="line"
        :data-dimension-candidate="
          props.dimensionCandidateLineIds.has(entry.line.id) ? 'true' : undefined
        "
        :data-cut-dimension-candidate="
          props.cutEdgeCandidateIds.has(entry.line.id) ? 'true' : undefined
        "
        :data-dimension-first-pick="
          props.dimensionFirstPick?.kind === 'line' && props.dimensionFirstPick.id === entry.line.id
            ? 'true'
            : undefined
        "
        @pointerenter="emit('hover', entry.line.id)"
        @pointerleave="emit('leave')"
      />
      <line
        :x1="entry.start.x"
        :y1="entry.start.y"
        :x2="entry.end.x"
        :y2="entry.end.y"
        stroke="transparent"
        stroke-width="12"
        vector-effect="non-scaling-stroke"
        :data-entity-id="entry.line.id"
        data-kind="line"
        @pointerenter="emit('hover', entry.line.id)"
        @pointerleave="emit('leave')"
      />
    </template>

    <path
      v-for="entry in props.curves"
      :key="entry.curve.id"
      :d="entry.d"
      fill="none"
      :class="props.entityClass(entry.curve)"
      :stroke-dasharray="props.entityDash(entry.curve)"
      :stroke-width="props.lineWidth(entry.curve.id)"
      stroke="currentColor"
      vector-effect="non-scaling-stroke"
      :data-entity-id="entry.curve.id"
      data-kind="curve"
      :data-cut-dimension-candidate="
        props.cutEdgeCandidateIds.has(entry.curve.id) ? 'true' : undefined
      "
      @pointerenter="emit('hover', entry.curve.id)"
      @pointerleave="emit('leave')"
      @dblclick.stop.prevent="emit('curve-double-click', entry.curve.id, $event)"
    />

    <path
      v-for="entry in props.arcs"
      :key="entry.arc.id"
      :d="entry.d"
      fill="none"
      :class="props.entityClass(entry.arc)"
      :stroke-dasharray="props.entityDash(entry.arc)"
      :stroke-width="props.lineWidth(entry.arc.id)"
      stroke="currentColor"
      vector-effect="non-scaling-stroke"
      :data-entity-id="entry.arc.id"
      data-kind="arc"
      :data-cut-dimension-candidate="
        props.cutEdgeCandidateIds.has(entry.arc.id) ? 'true' : undefined
      "
      @pointerenter="emit('hover', entry.arc.id)"
      @pointerleave="emit('leave')"
    />

    <template v-for="entry in props.circles" :key="entry.circle.id">
      <circle
        :cx="entry.cx"
        :cy="entry.cy"
        :r="entry.r"
        fill="none"
        :class="props.entityClass(entry.circle)"
        :stroke-dasharray="props.entityDash(entry.circle)"
        :stroke-width="props.lineWidth(entry.circle.id)"
        stroke="currentColor"
        vector-effect="non-scaling-stroke"
        :data-entity-id="entry.circle.id"
        data-kind="circle"
      />
      <circle
        :cx="entry.cx"
        :cy="entry.cy"
        :r="entry.r"
        fill="none"
        stroke="transparent"
        stroke-width="12"
        vector-effect="non-scaling-stroke"
        :data-entity-id="entry.circle.id"
        data-kind="circle"
      />
    </template>
  </g>

  <g
    v-if="props.highlightedIds.size > 0"
    class="pointer-events-none"
    data-testid="measured-highlight-layer"
    aria-hidden="true"
  >
    <template v-for="entry in props.lines" :key="`highlight-line-${entry.line.id}`">
      <line
        v-if="props.highlightedIds.has(entry.line.id)"
        :x1="entry.start.x"
        :y1="entry.start.y"
        :x2="entry.end.x"
        :y2="entry.end.y"
        class="text-dimension-formula"
        stroke="currentColor"
        stroke-width="7"
        stroke-linecap="round"
        stroke-opacity="0.45"
        vector-effect="non-scaling-stroke"
        :data-measured-source="entry.line.id"
      />
    </template>
    <template v-for="entry in props.curves" :key="`highlight-curve-${entry.curve.id}`">
      <path
        v-if="props.highlightedIds.has(entry.curve.id)"
        :d="entry.d"
        fill="none"
        class="text-dimension-formula"
        stroke="currentColor"
        stroke-width="7"
        stroke-linecap="round"
        stroke-opacity="0.45"
        vector-effect="non-scaling-stroke"
        :data-measured-source="entry.curve.id"
      />
    </template>
    <template v-for="entry in props.arcs" :key="`highlight-arc-${entry.arc.id}`">
      <path
        v-if="props.highlightedIds.has(entry.arc.id)"
        :d="entry.d"
        fill="none"
        class="text-dimension-formula"
        stroke="currentColor"
        stroke-width="7"
        stroke-linecap="round"
        stroke-opacity="0.45"
        vector-effect="non-scaling-stroke"
        :data-measured-source="entry.arc.id"
      />
    </template>
    <template v-for="entry in props.circles" :key="`highlight-circle-${entry.circle.id}`">
      <circle
        v-if="props.highlightedIds.has(entry.circle.id)"
        :cx="entry.cx"
        :cy="entry.cy"
        :r="entry.r"
        fill="none"
        class="text-dimension-formula"
        stroke="currentColor"
        stroke-width="7"
        stroke-opacity="0.45"
        vector-effect="non-scaling-stroke"
        :data-measured-source="entry.circle.id"
      />
    </template>
  </g>
</template>
