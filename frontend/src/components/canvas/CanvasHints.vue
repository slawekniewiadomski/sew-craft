<script setup lang="ts">
import type { EntityId } from '@sewcraft/geometry';

import type { EditorTool } from '@/lib/editor-tools';
import type { SplitCandidate } from '@/lib/split-line';

defineProps<{
  activePieceId: EntityId | null;
  activePieceLabel: string;
  arcHint: boolean;
  midpointHover: boolean;
  pointOnLineHover: boolean;
  tool: EditorTool;
  readOnly: boolean;
  splitLineHover: SplitCandidate | null;
  dimensionHintText: string | null;
  cutDimensionHintText: string | null;
  textLeaderHint: string | null;
}>();
</script>

<template>
  <div
    v-if="activePieceId !== null"
    class="pointer-events-none absolute left-2 top-2 rounded-sm bg-background/90 px-2 py-1 text-2xs shadow-sm"
    data-testid="active-piece-badge"
    role="status"
    aria-live="polite"
  >
    {{ activePieceLabel }}
  </div>

  <p
    v-if="arcHint"
    class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
    role="status"
    data-testid="arc-hint"
  >
    pick a point off the line
  </p>

  <p
    v-if="midpointHover"
    class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
    role="status"
    data-testid="midpoint-hint"
  >
    Click to create a point at this line's midpoint.
  </p>

  <p
    v-if="pointOnLineHover"
    class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
    role="status"
    data-testid="point-on-line-hint"
  >
    Click to create a point constrained to this line.
  </p>

  <p
    v-if="tool === 'split_line' && !readOnly && splitLineHover === null"
    class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
    role="status"
    data-testid="split-line-hint"
  >
    Click a straight line to split it.
  </p>

  <p
    v-if="splitLineHover !== null"
    class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
    role="status"
    data-testid="split-line-hint"
  >
    {{
      splitLineHover.pointId !== null
        ? 'Click to split this line at this point.'
        : splitLineHover.atCenter
          ? 'Click to split this line at its centre.'
          : 'Click to split this line here.'
    }}
  </p>

  <p
    v-if="dimensionHintText !== null"
    class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
    role="status"
    data-testid="dimension-hint"
  >
    {{ dimensionHintText }}
  </p>

  <p
    v-if="cutDimensionHintText !== null"
    class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
    role="status"
    data-testid="cut-dimension-hint"
  >
    {{ cutDimensionHintText }}
  </p>

  <p
    v-if="textLeaderHint !== null"
    class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
    role="status"
    data-testid="text-leader-hint"
  >
    {{ textLeaderHint }}
  </p>
</template>
