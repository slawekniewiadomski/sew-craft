<script setup lang="ts">
import type { CircleEndpoint } from '@/lib/circle-tool';
import type { DraftingEndpoint } from '@/lib/drafting';
import type { SplitCandidate } from '@/lib/split-line';
import type { Vec2 } from '@sewcraft/geometry';

/** The live tool previews drawn above the scene while a gesture is pending. */
defineProps<{
  /** One preview's lines/arc/tangents, already resolved in world space. */
  roundPreview: {
    lines: { id: string; from: Vec2; to: Vec2 }[];
    arc: string;
    tangents: Vec2[];
  } | null;
  tangentPreview: { arc: string; tangents: Vec2[] } | null;
  pointOnLineHover: { point: Vec2 } | null;
  splitLineHover: SplitCandidate | null;
  midpointHover: { x: number; y: number } | null;
  pendingLineStart: Vec2 | null;
  linePreview: Vec2 | null;
  lineStart: DraftingEndpoint | null;
  arcStartPosition: Vec2 | null;
  arcChord: { start: Vec2; end: Vec2 } | null;
  arcPreview: { d: string } | null;
  arcPendingStart: Vec2 | null;
  arcPendingEnd: Vec2 | null;
  pendingCircleCenter: Vec2 | null;
  circlePreview: Vec2 | null;
  circlePreviewRadius: number;
  circleCenter: CircleEndpoint | null;
  roundCornerActive: boolean;
  roundableCornerPoints: { id: string; x: number; y: number }[];
  rectanglePreview: { path: string; testId: string } | null;
  rectanglePendingCorners: Vec2[];
  viewportScale: number;
}>();
</script>

<template>
  <g
    v-if="roundPreview"
    class="pointer-events-none"
    data-testid="corner-round-preview"
    aria-hidden="true"
  >
    <line
      v-for="(entry, index) in roundPreview.lines"
      :key="entry.id"
      :x1="entry.from.x"
      :y1="entry.from.y"
      :x2="entry.to.x"
      :y2="entry.to.y"
      class="stroke-primary"
      stroke-width="1.5"
      stroke-dasharray="4 3"
      vector-effect="non-scaling-stroke"
      :data-testid="`corner-round-preview-line-${index}`"
    />
    <path
      :d="roundPreview.arc"
      fill="none"
      class="stroke-primary"
      stroke-width="1.5"
      stroke-dasharray="4 3"
      vector-effect="non-scaling-stroke"
      data-testid="corner-round-preview-arc"
    />
    <circle
      v-for="(tangent, index) in roundPreview.tangents"
      :key="`preview-${index}`"
      :cx="tangent.x"
      :cy="tangent.y"
      r="2.5"
      class="fill-primary"
    />
  </g>

  <g
    v-if="tangentPreview"
    class="pointer-events-none"
    data-testid="corner-round-drag-preview"
    aria-hidden="true"
  >
    <path
      :d="tangentPreview.arc"
      fill="none"
      class="stroke-primary"
      stroke-width="1.5"
      stroke-dasharray="4 3"
      vector-effect="non-scaling-stroke"
    />
    <circle
      v-for="(tangent, index) in tangentPreview.tangents"
      :key="`drag-${index}`"
      :cx="tangent.x"
      :cy="tangent.y"
      r="2.5"
      class="fill-primary"
    />
  </g>

  <g v-if="pointOnLineHover !== null" class="pointer-events-none" aria-hidden="true">
    <circle
      :cx="pointOnLineHover.point.x"
      :cy="pointOnLineHover.point.y"
      r="4"
      class="fill-primary stroke-primary-foreground"
      stroke-width="1"
      data-testid="point-on-line-ghost"
    />
  </g>

  <g
    v-if="splitLineHover !== null"
    class="pointer-events-none"
    aria-hidden="true"
    data-testid="split-line-ghost"
  >
    <path
      v-if="splitLineHover.atCenter"
      :d="`M ${splitLineHover.position.x} ${splitLineHover.position.y - 4} L ${
        splitLineHover.position.x + 4
      } ${splitLineHover.position.y} L ${splitLineHover.position.x} ${
        splitLineHover.position.y + 4
      } L ${splitLineHover.position.x - 4} ${splitLineHover.position.y} Z`"
      class="fill-primary stroke-primary-foreground"
      stroke-width="1"
      data-testid="split-line-center"
    />
    <circle
      v-else
      :cx="splitLineHover.position.x"
      :cy="splitLineHover.position.y"
      :r="splitLineHover.pointId === null ? 4 : 5"
      class="fill-primary stroke-primary-foreground"
      stroke-width="1"
    />
  </g>

  <g
    v-if="midpointHover !== null"
    class="pointer-events-none"
    aria-hidden="true"
    data-testid="midpoint-marker"
  >
    <path
      :d="`M ${midpointHover.x} ${midpointHover.y - 5 / viewportScale} L ${
        midpointHover.x + 5 / viewportScale
      } ${midpointHover.y} L ${midpointHover.x} ${
        midpointHover.y + 5 / viewportScale
      } L ${midpointHover.x - 5 / viewportScale} ${midpointHover.y} Z`"
      class="fill-primary stroke-primary-foreground"
      stroke-width="1"
      vector-effect="non-scaling-stroke"
    />
  </g>

  <g v-if="pendingLineStart !== null" class="pointer-events-none" aria-hidden="true">
    <line
      v-if="linePreview !== null"
      :x1="pendingLineStart.x"
      :y1="pendingLineStart.y"
      :x2="linePreview.x"
      :y2="linePreview.y"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="4 4"
      vector-effect="non-scaling-stroke"
      class="text-muted-foreground"
      data-testid="line-preview"
    />
    <circle
      v-if="lineStart?.kind === 'new'"
      :cx="pendingLineStart.x"
      :cy="pendingLineStart.y"
      r="4"
      class="fill-accent stroke-accent-foreground"
      stroke-width="1"
      data-testid="line-pending-point"
    />
  </g>

  <g v-if="arcStartPosition !== null" class="pointer-events-none" aria-hidden="true">
    <line
      v-if="arcChord !== null"
      :x1="arcChord.start.x"
      :y1="arcChord.start.y"
      :x2="arcChord.end.x"
      :y2="arcChord.end.y"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="4 4"
      vector-effect="non-scaling-stroke"
      class="text-muted-foreground"
      data-testid="arc-chord"
    />
    <path
      v-if="arcPreview !== null"
      :d="arcPreview.d"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="4 4"
      vector-effect="non-scaling-stroke"
      class="text-muted-foreground"
      data-testid="arc-preview"
    />
    <circle
      v-if="arcPendingStart !== null"
      :cx="arcPendingStart.x"
      :cy="arcPendingStart.y"
      r="4"
      class="fill-accent stroke-accent-foreground"
      stroke-width="1"
      data-testid="arc-pending-start"
    />
    <circle
      v-if="arcPendingEnd !== null"
      :cx="arcPendingEnd.x"
      :cy="arcPendingEnd.y"
      r="4"
      class="fill-accent stroke-accent-foreground"
      stroke-width="1"
      data-testid="arc-pending-end"
    />
  </g>

  <g v-if="pendingCircleCenter !== null" class="pointer-events-none" aria-hidden="true">
    <circle
      v-if="circlePreview !== null"
      :cx="pendingCircleCenter.x"
      :cy="pendingCircleCenter.y"
      :r="circlePreviewRadius"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="4 4"
      vector-effect="non-scaling-stroke"
      class="text-muted-foreground"
      data-testid="circle-preview"
    />
    <circle
      v-if="circleCenter?.kind === 'new'"
      :cx="pendingCircleCenter.x"
      :cy="pendingCircleCenter.y"
      r="4"
      class="fill-accent stroke-accent-foreground"
      stroke-width="1"
      data-testid="circle-pending-center"
    />
  </g>

  <g
    v-if="roundCornerActive"
    class="pointer-events-none"
    aria-hidden="true"
    data-testid="roundable-corner-layer"
  >
    <circle
      v-for="corner in roundableCornerPoints"
      :key="`roundable-${corner.id}`"
      :cx="corner.x"
      :cy="corner.y"
      r="2"
      class="roundable-corner fill-primary/60"
      data-testid="roundable-corner"
      :data-roundable-corner="corner.id"
    />
  </g>

  <g v-if="rectanglePreview !== null" class="pointer-events-none" aria-hidden="true">
    <path
      :d="rectanglePreview.path"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="4 4"
      vector-effect="non-scaling-stroke"
      class="text-muted-foreground"
      :data-testid="rectanglePreview.testId"
    />
  </g>

  <g v-if="rectanglePendingCorners.length > 0" class="pointer-events-none" aria-hidden="true">
    <circle
      v-for="(corner, index) in rectanglePendingCorners"
      :key="`rectangle-corner-${index}`"
      :cx="corner.x"
      :cy="corner.y"
      r="4"
      class="fill-accent stroke-accent-foreground"
      stroke-width="1"
      :data-testid="`rectangle-pending-corner-${index}`"
    />
  </g>
</template>
