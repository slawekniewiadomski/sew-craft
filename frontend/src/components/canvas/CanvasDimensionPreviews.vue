<script setup lang="ts">
import type { Vec2 } from '@sewcraft/geometry';

import type { LoopHandle } from '@/composables/use-dimension-gesture';
import type { LineView } from '@/lib/pattern-canvas-views';

type Tick = { start: Vec2; end: Vec2 };
type Ghost = { from: Vec2; to: Vec2 };

defineProps<{
  readOnly: boolean;
  /** The cut-dimension tool is armed, so its pick handles show. */
  cutDimensionArmed: boolean;
  cutEdgeHandles: LineView[];
  loopHandles: LoopHandle[];
  cutCandidateKeys: ReadonlySet<string>;
  dimensionFirstPickPoint: Vec2 | null;
  dimensionFirstPickTick: Tick | null;
  dimensionSecondPickPoint: Vec2 | null;
  dimensionSecondPickTick: Tick | null;
  dimensionCandidatePoint: Vec2 | null;
  dimensionGhost: Ghost | null;
  cutFirstPickPosition: Vec2 | null;
  cutSecondPickPosition: Vec2 | null;
  cutDimensionGhost: Ghost | null;
}>();
</script>

<template>
  <g v-if="cutDimensionArmed" class="pointer-events-none">
    <line
      v-for="entry in cutEdgeHandles"
      :key="`cut-edge-${entry.line.id}`"
      :x1="entry.start.x"
      :y1="entry.start.y"
      :x2="entry.end.x"
      :y2="entry.end.y"
      class="cut-edge-handle stroke-primary"
      stroke-width="6"
      stroke-opacity="0.25"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
      data-testid="cut-edge-handle"
      :data-cut-edge="entry.line.id"
    />
    <circle
      v-for="handle in loopHandles"
      :key="handle.key"
      :cx="handle.point.x"
      :cy="handle.point.y"
      :r="handle.anchor.loop === 'stitch' ? 6 : 7"
      :stroke-width="
        cutCandidateKeys.has(handle.key) ? 2 : handle.anchor.loop === 'stitch' ? 1 : 1.5
      "
      :stroke-dasharray="handle.anchor.loop === 'stitch' ? '2 2' : undefined"
      :class="
        handle.anchor.loop === 'stitch'
          ? 'seamline-point-handle fill-none stroke-primary'
          : 'cut-vertex-handle fill-none stroke-primary'
      "
      data-testid="loop-point-handle"
      :data-loop="handle.anchor.loop ?? 'cut'"
      :data-loop-piece="handle.piece.id"
      :data-loop-edge="handle.anchor.edge"
      :data-loop-at="handle.anchor.at"
      :data-cut-dimension-candidate="cutCandidateKeys.has(handle.key) ? 'true' : undefined"
    />
  </g>

  <g v-if="!readOnly" class="pointer-events-none" aria-hidden="true">
    <template v-if="dimensionFirstPickPoint !== null">
      <circle
        :cx="dimensionFirstPickPoint.x"
        :cy="dimensionFirstPickPoint.y"
        r="9"
        class="fill-primary/15"
      />
      <circle
        :cx="dimensionFirstPickPoint.x"
        :cy="dimensionFirstPickPoint.y"
        r="7"
        fill="none"
        class="stroke-primary"
        stroke-width="2.5"
        data-testid="dimension-pick-first"
      />
    </template>
    <line
      v-if="dimensionFirstPickTick !== null"
      :x1="dimensionFirstPickTick.start.x"
      :y1="dimensionFirstPickTick.start.y"
      :x2="dimensionFirstPickTick.end.x"
      :y2="dimensionFirstPickTick.end.y"
      class="stroke-primary"
      stroke-width="3"
      stroke-linecap="round"
      data-testid="dimension-pick-first"
    />
    <template v-if="dimensionSecondPickPoint !== null">
      <circle
        :cx="dimensionSecondPickPoint.x"
        :cy="dimensionSecondPickPoint.y"
        r="6"
        fill="none"
        class="stroke-primary"
        stroke-width="2"
        data-testid="dimension-pick-second"
      />
    </template>
    <line
      v-if="dimensionSecondPickTick !== null"
      :x1="dimensionSecondPickTick.start.x"
      :y1="dimensionSecondPickTick.start.y"
      :x2="dimensionSecondPickTick.end.x"
      :y2="dimensionSecondPickTick.end.y"
      class="stroke-primary"
      stroke-width="3"
      stroke-linecap="round"
      data-testid="dimension-pick-second"
    />
    <circle
      v-if="dimensionCandidatePoint !== null"
      :cx="dimensionCandidatePoint.x"
      :cy="dimensionCandidatePoint.y"
      r="6"
      fill="none"
      class="stroke-primary"
      stroke-width="1.5"
      data-testid="dimension-candidate-ring"
    />
    <template v-if="dimensionGhost !== null">
      <line
        :x1="dimensionGhost.from.x"
        :y1="dimensionGhost.from.y"
        :x2="dimensionGhost.to.x"
        :y2="dimensionGhost.to.y"
        class="stroke-primary"
        stroke-width="1"
        stroke-dasharray="4 3"
        vector-effect="non-scaling-stroke"
        data-testid="dimension-rubber-band"
      />
      <circle
        :cx="dimensionGhost.to.x"
        :cy="dimensionGhost.to.y"
        r="3"
        class="fill-background stroke-primary"
        stroke-width="1.5"
        data-testid="dimension-rubber-band-end"
      />
    </template>
  </g>

  <g v-if="!readOnly" class="pointer-events-none" aria-hidden="true">
    <template v-if="cutFirstPickPosition !== null">
      <circle
        :cx="cutFirstPickPosition.x"
        :cy="cutFirstPickPosition.y"
        r="10"
        class="fill-primary/15"
      />
      <circle
        :cx="cutFirstPickPosition.x"
        :cy="cutFirstPickPosition.y"
        r="8"
        fill="none"
        class="stroke-primary"
        stroke-width="2.5"
        data-testid="cut-dimension-pick-first"
      />
    </template>
    <circle
      v-if="cutSecondPickPosition !== null"
      :cx="cutSecondPickPosition.x"
      :cy="cutSecondPickPosition.y"
      r="6"
      fill="none"
      class="stroke-primary"
      stroke-width="2"
      data-testid="cut-dimension-pick-second"
    />
    <template v-if="cutDimensionGhost !== null">
      <line
        :x1="cutDimensionGhost.from.x"
        :y1="cutDimensionGhost.from.y"
        :x2="cutDimensionGhost.to.x"
        :y2="cutDimensionGhost.to.y"
        class="stroke-primary"
        stroke-width="1"
        stroke-dasharray="4 3"
        vector-effect="non-scaling-stroke"
        data-testid="cut-dimension-rubber-band"
      />
      <circle
        :cx="cutDimensionGhost.to.x"
        :cy="cutDimensionGhost.to.y"
        r="3"
        class="fill-background stroke-primary"
        stroke-width="1.5"
        data-testid="cut-dimension-rubber-band-end"
      />
    </template>
  </g>
</template>
