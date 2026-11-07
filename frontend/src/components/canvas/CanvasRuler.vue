<script setup lang="ts">
import type { Size } from '@/lib/viewport';

/** The screen-space rulers along the top and left edges. */
defineProps<{
  size: Size;
  xTicks: number[];
  yTicks: number[];
  xTickPosition: (value: number) => number;
  yTickPosition: (value: number) => number;
}>();
</script>

<template>
  <g class="pointer-events-none">
    <rect
      x="0"
      y="0"
      :width="size.width"
      height="16"
      class="fill-background/90"
      data-testid="ruler-x"
    />
    <rect
      x="0"
      y="0"
      width="16"
      :height="size.height"
      class="fill-background/90"
      data-testid="ruler-y"
    />

    <g v-for="tick in xTicks" :key="`x-${tick}`">
      <line
        :x1="xTickPosition(tick)"
        :x2="xTickPosition(tick)"
        y1="12"
        y2="16"
        class="stroke-border"
        vector-effect="non-scaling-stroke"
      />
      <text :x="xTickPosition(tick) + 3" y="11" class="fill-muted-foreground text-[8px]">
        {{ tick }}
      </text>
    </g>

    <g v-for="tick in yTicks" :key="`y-${tick}`">
      <line
        x1="12"
        x2="16"
        :y1="yTickPosition(tick)"
        :y2="yTickPosition(tick)"
        class="stroke-border"
        vector-effect="non-scaling-stroke"
      />
    </g>
  </g>
</template>
