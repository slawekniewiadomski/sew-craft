<script setup lang="ts">
import type { CornerRound } from '@sewcraft/geometry';

import type {
  CornerRoundHandleView,
  CornerRoundLabelView,
} from '@/composables/use-corner-round-edit';
import { CONSTRAINT_ICONS, type ConstraintMarker } from '@/lib/constraint-view';

defineProps<{
  roundHandles: CornerRoundHandleView[];
  roundLabels: CornerRoundLabelView[];
  constraintLayer: ConstraintMarker[];
}>();

const emit = defineEmits<{
  'begin-tangent-drag': [handle: CornerRoundHandleView, event: PointerEvent];
  'open-corner-editor': [round: CornerRound, x: number, y: number];
}>();
</script>

<template>
  <g class="pointer-events-none" data-testid="corner-round-layer">
    <g
      v-for="handle in roundHandles"
      :key="`handle-${handle.id}-${handle.endIndex}`"
      class="pointer-events-auto cursor-move"
      :data-testid="`corner-round-handle-${handle.id}-${handle.endIndex}`"
      :transform="`translate(${handle.x} ${handle.y})`"
      role="img"
      :aria-label="`Tangent handle for corner round ${handle.id}`"
    >
      <title>Drag to change the corner radius</title>
      <rect
        x="-5"
        y="-5"
        width="10"
        height="10"
        class="fill-primary stroke-background"
        stroke-width="1.5"
        @pointerdown.left.stop="emit('begin-tangent-drag', handle, $event)"
      />
    </g>

    <g
      v-for="label in roundLabels"
      :key="`label-${label.id}`"
      class="pointer-events-auto cursor-text"
      :data-testid="`corner-round-label-${label.id}`"
      :transform="`translate(${label.screenX} ${label.screenY})`"
      role="img"
      :aria-label="label.accessible"
      @pointerdown.left.stop.prevent
      @dblclick.stop.prevent="emit('open-corner-editor', label.round, label.screenX, label.screenY)"
    >
      <title>Double-click to edit the radius</title>
      <rect x="-18" y="-8" width="36" height="16" rx="2" class="fill-background" />
      <text text-anchor="middle" dominant-baseline="middle" class="fill-foreground text-[11px]">
        {{ label.text }}
      </text>
    </g>
  </g>

  <g class="pointer-events-none" data-testid="constraints-layer">
    <g
      v-for="marker in constraintLayer"
      :key="marker.id"
      class="pointer-events-auto"
      :data-constraint-id="marker.id"
      :data-constraint-type="marker.type"
      :transform="`translate(${marker.x} ${marker.y})`"
      role="img"
      :aria-label="marker.label"
    >
      <title>{{ marker.label }}</title>
      <circle r="9" class="fill-background stroke-muted-foreground" stroke-width="1" />
      <g transform="translate(-6 -6) scale(0.5)">
        <path
          v-for="(d, index) in CONSTRAINT_ICONS[marker.type].paths"
          :key="index"
          :d="d"
          fill="none"
          stroke="currentColor"
          stroke-width="2.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-foreground"
        />
        <circle
          v-for="(dot, index) in CONSTRAINT_ICONS[marker.type].dots"
          :key="`dot-${index}`"
          :cx="dot.cx"
          :cy="dot.cy"
          :r="dot.r"
          class="fill-foreground"
        />
      </g>
    </g>
  </g>
</template>
