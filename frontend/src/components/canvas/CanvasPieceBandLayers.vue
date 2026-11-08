<script setup lang="ts">
import type { SeamView, PieceView, RegionView } from '@/lib/pattern-canvas-views';

defineProps<{
  pieceViews: PieceView[];
  regionViews: RegionView[];
  seams: SeamView[];
  regionClass: (region: RegionView) => string;
}>();
</script>

<template>
  <g class="pointer-events-none" data-testid="piece-band-layer">
    <path
      v-for="piece in pieceViews"
      v-show="piece.band !== null"
      :key="`band-${piece.id}`"
      :d="piece.band ?? ''"
      fill-rule="evenodd"
      stroke="none"
      :class="piece.selected ? 'fill-primary/25' : 'fill-primary/10'"
      :data-piece-band="piece.id"
    />
  </g>

  <g class="pointer-events-none" data-testid="piece-region-layer">
    <path
      v-for="region in regionViews"
      :key="region.key"
      :d="region.d"
      :class="regionClass(region)"
      :stroke-width="region.selected || region.hovered ? 1.5 : 0.75"
      vector-effect="non-scaling-stroke"
      :data-region="region.key"
    />
  </g>

  <g class="pointer-events-none" data-testid="seam-layer">
    <path
      v-for="seam in seams"
      :key="seam.edge"
      :d="seam.d"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="6 3"
      vector-effect="non-scaling-stroke"
      :class="seam.selfIntersects ? 'text-destructive' : 'text-muted-foreground'"
      :data-seam-edge="seam.edge"
    />
  </g>
</template>
