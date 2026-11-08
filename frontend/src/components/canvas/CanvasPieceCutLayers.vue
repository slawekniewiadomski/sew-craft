<script setup lang="ts">
import type { EntityId } from '@sewcraft/geometry';

import type { PieceView } from '@/lib/pattern-canvas-views';

defineProps<{
  pieceViews: PieceView[];
  /** Drag preview offset for the pressed piece, in millimetres. */
  movePreview: (pieceId: EntityId) => string | undefined;
}>();
</script>

<template>
  <g class="pointer-events-none" data-testid="piece-cut-layer">
    <path
      v-for="piece in pieceViews"
      :key="`cut-${piece.id}`"
      :d="piece.cut"
      fill="none"
      :stroke-width="1.5"
      :class="piece.selfIntersects ? 'stroke-destructive' : 'stroke-foreground'"
      vector-effect="non-scaling-stroke"
      :data-piece-cut="piece.id"
      :transform="movePreview(piece.id)"
    />
  </g>

  <g class="pointer-events-none" data-testid="piece-stitch-layer">
    <path
      v-for="piece in pieceViews"
      :key="`stitch-${piece.id}`"
      :d="piece.stitch"
      fill="none"
      stroke-width="0.75"
      class="stroke-muted-foreground"
      vector-effect="non-scaling-stroke"
      :data-piece-stitch="piece.id"
    />
  </g>

  <g class="pointer-events-none" data-testid="piece-fold-layer">
    <template v-for="piece in pieceViews" :key="`fold-${piece.id}`">
      <path
        v-for="(fold, index) in piece.folds"
        :key="`fold-${piece.id}-${index}`"
        :d="fold"
        fill="none"
        stroke-width="1"
        stroke-dasharray="6 3"
        class="stroke-muted-foreground"
        vector-effect="non-scaling-stroke"
        :data-piece-fold="piece.id"
      />
    </template>
  </g>
</template>
