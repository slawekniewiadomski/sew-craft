<script setup lang="ts">
/** The marquee rectangle while a rectangular selection is being dragged. */
defineProps<{
  rect: { x: number; y: number; width: number; height: number } | null;
}>();
</script>

<template>
  <g v-if="rect !== null" class="pointer-events-none" data-testid="selection-marquee">
    <rect
      :x="rect.x"
      :y="rect.y"
      :width="rect.width"
      :height="rect.height"
      fill="currentColor"
      fill-opacity="0.1"
      stroke="currentColor"
      stroke-width="1"
      stroke-dasharray="4 4"
      vector-effect="non-scaling-stroke"
      class="text-primary"
    />
  </g>
</template>
