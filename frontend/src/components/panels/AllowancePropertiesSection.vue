<script setup lang="ts">
import type { AllowanceKind, BandTarget, EntityId, PatternDocument } from '@sewcraft/geometry';
import { computed } from 'vue';

import Pill from '@/components/sidebar/Pill.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import { type AllowanceEdgeWidth } from '@/lib/allowance-edit';
import {
  allowanceSelection,
  type AllowanceCornerRow,
  type AllowanceEdgeRow,
} from '@/lib/allowance-selection';
import { parseAllowanceWidth } from '@/lib/allowance-width';
import { formatDimensionValue } from '@/lib/dimensions';
import type { PieceSummary } from '@/lib/pieces';

const props = defineProps<{
  document: PatternDocument;
  summary: PieceSummary;
  targets: BandTarget[];
}>();

const emit = defineEmits<{
  'set-edge-widths': [changes: AllowanceEdgeWidth[], width: number];
  'remove-edge-allowances': [edges: EntityId[]];
  'set-corner-widths': [rounds: EntityId[], cutWidth: number];
  'clear-corner-widths': [rounds: EntityId[]];
}>();

const KIND_LABELS: Record<AllowanceKind | 'none', string> = {
  none: 'No allowance',
  seam: 'Seam',
  single: 'Single fold',
  double: 'Double fold',
};

const selection = computed(() => allowanceSelection(props.document, props.summary, props.targets));

const edgeWidth = computed(() => {
  if (selection.value.edgeWidthsMixed) return '';
  const row = selection.value.edges[0]!;
  return row.width === 0 ? '' : String(row.width);
});

const edgePlaceholder = computed(() => (selection.value.edgeWidthsMixed ? 'Mixed' : 'Add'));

const cornerWidth = computed(() => {
  if (selection.value.cornerWidthsMixed) return '';
  const row = selection.value.corners[0]!;
  return row.cutWidth === null ? '' : String(row.cutWidth);
});

const cornerPlaceholder = computed(() => (selection.value.cornerWidthsMixed ? 'Mixed' : 'Inherit'));

const hasEdgeAllowance = computed(() => selection.value.edges.some((row) => row.kind !== 'none'));

const hasOwnCornerWidth = computed(() =>
  selection.value.corners.some((row) => row.cutWidth !== null),
);

const countLabel = computed(() =>
  selection.value.count === 1 ? '1 region' : `${selection.value.count} regions`,
);

const edgeCutDistance = computed(() => selection.value.edges[0]!.cutDistance);

function edgeAllowanceLabel(row: AllowanceEdgeRow): string {
  return row.kind === 'none' ? KIND_LABELS.none : `${KIND_LABELS[row.kind]} ${row.width} mm`;
}

function cornerStateLabel(row: AllowanceCornerRow): string {
  switch (row.state) {
    case 'own':
      return 'Own';
    case 'inherited':
      return 'Inherited';
    case 'split':
      return 'Split';
    case 'none':
      return 'No allowance';
    case 'broken':
      return 'Broken';
  }
}

function cornerWidthText(row: AllowanceCornerRow): string {
  if (row.state === 'split') {
    return `${row.halves.map((half) => formatDimensionValue(half)).join(' + ')} mm`;
  }
  return row.effective === null ? '—' : `${formatDimensionValue(row.effective)} mm`;
}

function onEdgeWidth(event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseAllowanceWidth(input.value);
  if (width === null) {
    input.value = edgeWidth.value;
    return;
  }

  emit(
    'set-edge-widths',
    selection.value.edges.map((row) => ({
      edge: row.edge,
      kind: row.kind === 'none' ? 'seam' : row.kind,
    })),
    width,
  );
}

function removeEdges(): void {
  emit(
    'remove-edge-allowances',
    selection.value.edges.map((row) => row.edge),
  );
}

function onCornerWidth(event: Event): void {
  const input = event.target as HTMLInputElement;
  const rounds = selection.value.corners.map((row) => row.round);

  if (input.value.trim() === '') {
    if (hasOwnCornerWidth.value) emit('clear-corner-widths', rounds);
    else input.value = cornerWidth.value;
    return;
  }

  const width = parseAllowanceWidth(input.value);
  if (width === null) {
    input.value = cornerWidth.value;
    return;
  }

  emit('set-corner-widths', rounds, width);
}

function clearCorners(): void {
  emit(
    'clear-corner-widths',
    selection.value.corners.map((row) => row.round),
  );
}
</script>

<template>
  <SidebarSection
    v-if="selection.count > 0"
    label="Seam allowance"
    heading-id="allowance-properties-heading"
    data-testid="allowance-properties"
  >
    <p class="mb-3 text-2xs text-muted-foreground" data-testid="allowance-context">
      {{ summary.name ?? 'Piece' }} · {{ countLabel }}
    </p>

    <div v-if="selection.edges.length > 0" class="space-y-2" data-testid="allowance-edges">
      <div class="flex items-center gap-1.5">
        <h3 class="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {{ selection.edges.length === 1 ? 'Edge' : 'Edges' }}
        </h3>
        <Pill v-if="selection.edgeWidthsMixed" tone="neutral" data-testid="allowance-edge-mixed">
          Mixed
        </Pill>
      </div>

      <ul class="space-y-1">
        <li
          v-for="row in selection.edges"
          :key="row.edge"
          class="flex min-w-0 items-center gap-1.5 text-2xs"
          :data-testid="`allowance-edge-${row.edge}`"
        >
          <span class="min-w-0 flex-1 truncate font-mono text-muted-foreground">
            {{ row.label }}
          </span>
          <Pill
            :tone="row.kind === 'none' ? 'neutral' : 'accent'"
            :data-testid="`allowance-edge-kind-${row.edge}`"
          >
            {{ edgeAllowanceLabel(row) }}
          </Pill>
        </li>
      </ul>

      <label class="flex flex-wrap items-center gap-1.5">
        <span class="text-2xs text-muted-foreground">Width</span>
        <SidebarInput
          class="w-20 font-mono text-2xs"
          :value="edgeWidth"
          :placeholder="edgePlaceholder"
          aria-label="Allowance width (mm)"
          data-testid="allowance-edge-width"
          @change="onEdgeWidth"
        />
        <span class="text-2xs text-muted-foreground">mm</span>
      </label>

      <p v-if="selection.edges.length === 1" class="text-2xs text-muted-foreground">
        Cut distance {{ formatDimensionValue(edgeCutDistance) }} mm
      </p>

      <SidebarButton
        v-if="hasEdgeAllowance"
        data-testid="allowance-edge-remove"
        @click="removeEdges"
      >
        {{ selection.edges.length === 1 ? 'Remove allowance' : 'Remove allowances' }}
      </SidebarButton>
    </div>

    <div v-if="selection.corners.length > 0" class="mt-4 space-y-2" data-testid="allowance-corners">
      <div class="flex items-center gap-1.5">
        <h3 class="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {{ selection.corners.length === 1 ? 'Corner round' : 'Corner rounds' }}
        </h3>
        <Pill
          v-if="selection.cornerWidthsMixed"
          tone="neutral"
          data-testid="allowance-corner-mixed"
        >
          Mixed
        </Pill>
      </div>

      <ul class="space-y-1">
        <li
          v-for="row in selection.corners"
          :key="row.round"
          class="flex min-w-0 items-center gap-1.5 text-2xs"
          :data-testid="`allowance-corner-${row.round}`"
        >
          <span class="min-w-0 flex-1 truncate font-mono text-muted-foreground">
            {{ row.round }} · radius {{ formatDimensionValue(row.radius) }} mm
          </span>
          <Pill
            :tone="row.state === 'broken' ? 'danger' : 'neutral'"
            :data-testid="`allowance-corner-state-${row.round}`"
          >
            {{ cornerStateLabel(row) }} {{ cornerWidthText(row) }}
          </Pill>
        </li>
      </ul>

      <label class="flex flex-wrap items-center gap-1.5">
        <span class="text-2xs text-muted-foreground">Own cut width</span>
        <SidebarInput
          class="w-20 font-mono text-2xs"
          :value="cornerWidth"
          :placeholder="cornerPlaceholder"
          aria-label="Corner cut width (mm)"
          data-testid="allowance-corner-width"
          @change="onCornerWidth"
        />
        <span class="text-2xs text-muted-foreground">mm</span>
      </label>

      <SidebarButton
        v-if="hasOwnCornerWidth"
        data-testid="allowance-corner-inherit"
        @click="clearCorners"
      >
        Use edge width
      </SidebarButton>
    </div>
  </SidebarSection>
</template>
