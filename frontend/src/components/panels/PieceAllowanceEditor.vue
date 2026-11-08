<script setup lang="ts">
import type { AllowanceKind, BandTarget, EntityId } from '@sewcraft/geometry';
import { computed, ref, watch } from 'vue';

import Pill from '@/components/sidebar/Pill.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSelect from '@/components/sidebar/SidebarSelect.vue';
import type { BulkAllowanceEdit } from '@/lib/allowance-edit';
import type { AllowanceChoice } from '@/lib/allowance-defaults';
import { parseAllowanceWidth } from '@/lib/allowance-width';
import { formatDimensionValue } from '@/lib/dimensions';
import type { PieceAllowanceRow, PieceCornerRow, PieceSummary } from '@/lib/pieces';

const props = withDefaults(
  defineProps<{
    summary: PieceSummary;
    /** Prefix for the card's data-testids, so two mounted cards never collide. */
    prefix?: string;
    /** The project default the All edges row starts from when the edges differ. */
    defaultAllowance?: AllowanceChoice;
    /** The allowance regions selected on the canvas. */
    selectedTargets?: BandTarget[];
  }>(),
  {
    prefix: 'entity',
    defaultAllowance: () => ({ kind: 'seam' as const, width: 10 }),
    selectedTargets: () => [],
  },
);

const emit = defineEmits<{
  'set-piece-allowance': [
    piece: EntityId,
    edge: EntityId,
    value: { kind: AllowanceKind; width: number } | null,
  ];
  'set-all-allowances': [piece: EntityId, value: { kind: AllowanceKind; width: number } | null];
  'set-piece-corner-allowance': [
    piece: EntityId,
    round: EntityId,
    value: { cutWidth: number } | null,
  ];
  'apply-allowances': [edit: BulkAllowanceEdit];
}>();

/** Allowance kinds offered by the piece editor; `none` removes the allowance. */
const ALLOWANCE_KIND_OPTIONS: { value: AllowanceKind | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'seam', label: 'Seam' },
  { value: 'single', label: 'Single fold' },
  { value: 'double', label: 'Double fold' },
];

const DEFAULT_ALLOWANCE_WIDTH = 10;

/** The All edges row starts from the shared value, or the project default. */
const allInitial = computed<AllowanceChoice>(() => props.summary.uniform ?? props.defaultAllowance);
const allKind = ref<AllowanceChoice['kind']>(allInitial.value.kind);
const allWidth = ref<number>(allInitial.value.width);
const allMixed = computed(() => props.summary.uniform === null);

watch(
  allInitial,
  (value) => {
    allKind.value = value.kind;
    allWidth.value = value.width;
  },
  { immediate: true },
);

const canApplyAll = computed(
  () =>
    props.summary.edges.length > 0 &&
    (allKind.value === 'none' || (Number.isFinite(allWidth.value) && allWidth.value > 0)),
);

function testId(suffix: string): string {
  return `${props.prefix}-${suffix}`;
}

function allowanceKind(row: PieceAllowanceRow, event: Event): void {
  const kind = (event.target as HTMLSelectElement).value as AllowanceKind | 'none';
  if (kind === 'none') {
    emit('set-piece-allowance', props.summary.id, row.edge, null);
    return;
  }

  emit('set-piece-allowance', props.summary.id, row.edge, {
    kind,
    width: row.width > 0 ? row.width : DEFAULT_ALLOWANCE_WIDTH,
  });
}

/** An invalid or unchanged allowance width snaps back without a command. */
function allowanceWidth(row: PieceAllowanceRow, event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseAllowanceWidth(input.value);
  if (width === null || width === row.width || row.kind === 'none') {
    input.value = row.width > 0 ? String(row.width) : '';
    return;
  }

  emit('set-piece-allowance', props.summary.id, row.edge, {
    kind: row.kind,
    width,
  });
}

function allKindChanged(event: Event): void {
  allKind.value = (event.target as HTMLSelectElement).value as AllowanceChoice['kind'];
}

/** An invalid width snaps back rather than disabling the row silently. */
function allWidthChanged(event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseAllowanceWidth(input.value);
  if (width === null) {
    input.value = String(allWidth.value);
    return;
  }
  allWidth.value = width;
}

/** Whether one selected edge is this row's edge. */
function edgeSelected(row: PieceAllowanceRow): boolean {
  return props.selectedTargets.some((target) => target.kind === 'edge' && target.edge === row.edge);
}

/** Whether one selected corner is this row's round. */
function cornerSelected(row: PieceCornerRow): boolean {
  return props.selectedTargets.some(
    (target) => target.kind === 'round' && target.round === row.round,
  );
}

/** An invalid or unchanged corner width snaps back without a command. */
function cornerWidth(row: PieceCornerRow, event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseAllowanceWidth(input.value);
  if (width === null || width === row.cutWidth) {
    input.value = row.cutWidth === null ? '' : String(row.cutWidth);
    return;
  }
  emit('set-piece-corner-allowance', props.summary.id, row.round, { cutWidth: width });
}

/** Double writes twice the corner's own or inherited cut width. */
function doubleCorner(row: PieceCornerRow): void {
  // The button renders only where one of the two is set.
  const base = (row.cutWidth ?? row.inherited)!;
  emit('set-piece-corner-allowance', props.summary.id, row.round, { cutWidth: base * 2 });
}

/** The selection editor offers a kind only when every target is an edge. */
const allEdgesSelected = computed(() =>
  props.selectedTargets.every((target) => target.kind === 'edge'),
);

const bulkKind = ref<AllowanceKind>('seam');
const bulkWidth = ref<number>(10);
const canBulkApply = computed(() => Number.isFinite(bulkWidth.value) && bulkWidth.value > 0);

function applyBulk(): void {
  emit('apply-allowances', {
    mode: 'set',
    cutWidth: bulkWidth.value,
    ...(allEdgesSelected.value ? { kind: bulkKind.value } : {}),
  });
}

/** Apply writes one value to every edge in a single grouped dispatch. */
function applyAll(): void {
  emit(
    'set-all-allowances',
    props.summary.id,
    allKind.value === 'none' ? null : { kind: allKind.value, width: allWidth.value },
  );
}
</script>

<template>
  <div class="space-y-2 rounded-md bg-muted/60 p-2" data-testid="piece-all">
    <div class="flex items-center gap-1.5">
      <span class="shrink-0 text-2xs text-muted-foreground">All edges</span>
      <SidebarSelect
        class="min-w-0 flex-1"
        :value="allKind"
        :aria-label="`Allowance kind for all edges of piece ${props.summary.id}`"
        :data-testid="testId('piece-all-kind')"
        @change="allKindChanged"
      >
        <option v-for="option in ALLOWANCE_KIND_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </SidebarSelect>
    </div>
    <div class="flex items-center gap-1.5">
      <SidebarInput
        type="number"
        min="0.1"
        step="0.1"
        class="w-16 tabular-nums"
        :value="allKind === 'none' ? '' : allWidth"
        :disabled="allKind === 'none'"
        :aria-label="`Finished width for all edges of piece ${props.summary.id}`"
        :data-testid="testId('piece-all-width')"
        @change="allWidthChanged"
      />
      <span class="text-2xs text-muted-foreground">mm</span>
      <Pill v-if="allMixed" tone="neutral" :data-testid="testId('piece-all-mixed')">Mixed</Pill>
      <SidebarButton
        class="ml-auto"
        :disabled="!canApplyAll"
        :data-testid="testId('piece-all-apply')"
        @click="applyAll"
      >
        Apply
      </SidebarButton>
    </div>
  </div>

  <div
    v-if="props.selectedTargets.length > 1"
    class="rounded-md bg-muted/50 p-2"
    :data-testid="testId('piece-selection-editor')"
  >
    <div class="mb-1.5 flex items-center justify-between gap-2">
      <span class="text-2xs font-medium">
        {{ props.selectedTargets.length }} regions selected
      </span>
      <Pill tone="neutral" :data-testid="testId('piece-selection-mode')">
        {{ allEdgesSelected ? 'edges' : 'cut widths' }}
      </Pill>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <SidebarSelect
        v-if="allEdgesSelected"
        class="w-24"
        :value="bulkKind"
        aria-label="Allowance kind for the selected edges"
        :data-testid="testId('piece-selection-kind')"
        @change="bulkKind = ($event.target as HTMLSelectElement).value as AllowanceKind"
      >
        <option value="seam">Seam</option>
        <option value="single">Single fold</option>
        <option value="double">Double fold</option>
      </SidebarSelect>
      <SidebarInput
        type="number"
        min="0.1"
        step="0.1"
        class="w-16 tabular-nums"
        :value="bulkWidth"
        :aria-label="`Width for the ${props.selectedTargets.length} selected regions`"
        :data-testid="testId('piece-selection-width')"
        @change="
          bulkWidth = parseAllowanceWidth(($event.target as HTMLInputElement).value) ?? bulkWidth
        "
      />
      <span class="text-2xs text-muted-foreground">{{ allEdgesSelected ? 'mm' : 'mm cut' }}</span>
      <SidebarButton
        :disabled="!canBulkApply"
        :data-testid="testId('piece-selection-apply')"
        @click="applyBulk"
      >
        Apply
      </SidebarButton>
      <SidebarButton
        :data-testid="testId('piece-selection-double')"
        @click="emit('apply-allowances', { mode: 'double' })"
      >
        Double
      </SidebarButton>
      <SidebarButton
        :data-testid="testId('piece-selection-inherit')"
        @click="emit('apply-allowances', { mode: 'inherit' })"
      >
        Inherit
      </SidebarButton>
    </div>
  </div>

  <details class="group border-t pt-3">
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-2 text-2xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden"
    >
      <span>
        Per-edge allowances
        <span class="ml-1 tabular-nums">{{ props.summary.allowances.length }}</span>
      </span>
      <span aria-hidden="true" class="transition-transform group-open:rotate-180">⌄</span>
    </summary>
    <ul class="mt-2 space-y-2" :aria-label="`Allowances for piece ${props.summary.id}`">
      <li
        v-for="row in props.summary.allowances"
        :key="row.edge"
        class="flex flex-wrap items-center gap-1.5 rounded-md px-1 py-0.5"
        :class="edgeSelected(row) ? 'bg-muted/60' : ''"
        :data-testid="testId(`piece-allowance-${row.edge}`)"
      >
        <span class="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">
          {{ row.edge }}
        </span>
        <SidebarSelect
          class="w-24"
          :value="row.kind"
          :aria-label="`Allowance kind for edge ${row.edge}`"
          :data-testid="testId(`piece-kind-${row.edge}`)"
          @change="allowanceKind(row, $event)"
        >
          <option
            v-for="option in ALLOWANCE_KIND_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </SidebarSelect>
        <SidebarInput
          type="number"
          min="0.1"
          step="0.1"
          class="w-16 tabular-nums"
          :value="row.width > 0 ? row.width : ''"
          :disabled="row.kind === 'none'"
          :aria-label="`Finished width for edge ${row.edge}`"
          :data-testid="testId(`piece-width-${row.edge}`)"
          @change="allowanceWidth(row, $event)"
        />
        <span class="text-2xs text-muted-foreground">mm</span>
      </li>
    </ul>
  </details>

  <details v-if="props.summary.corners.length > 0" class="group border-t pt-3">
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-2 text-2xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden"
    >
      <span>
        Rounded corners
        <span class="ml-1 tabular-nums">{{ props.summary.corners.length }}</span>
      </span>
      <span aria-hidden="true" class="transition-transform group-open:rotate-180">⌄</span>
    </summary>
    <ul class="mt-2 space-y-2" :aria-label="`Corner allowances for piece ${props.summary.id}`">
      <li
        v-for="row in props.summary.corners"
        :key="row.round"
        class="flex flex-wrap items-center gap-1.5 rounded-md px-1 py-0.5"
        :class="cornerSelected(row) ? 'bg-muted/60' : ''"
        :data-testid="testId(`piece-corner-${row.round}`)"
      >
        <span class="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">
          R {{ formatDimensionValue(row.radius) }}
        </span>
        <Pill
          v-if="row.state === 'split'"
          tone="neutral"
          :data-testid="testId(`piece-corner-split-${row.round}`)"
        >
          Split
        </Pill>
        <Pill
          v-else-if="row.state === 'none'"
          tone="neutral"
          :data-testid="testId(`piece-corner-none-${row.round}`)"
        >
          No allowance
        </Pill>
        <span
          v-if="row.state === 'split'"
          class="text-2xs tabular-nums text-muted-foreground"
          :data-testid="testId(`piece-corner-halves-${row.round}`)"
        >
          {{ row.halves.map((half) => formatDimensionValue(half)).join(' / ') }} mm
        </span>
        <template v-if="row.state !== 'broken'">
          <SidebarInput
            type="number"
            min="0.1"
            step="0.1"
            class="w-16 tabular-nums"
            :value="row.cutWidth ?? ''"
            :placeholder="row.inherited === null ? '' : String(row.inherited)"
            :aria-label="`Cut width for corner ${row.round}`"
            :data-testid="testId(`piece-corner-width-${row.round}`)"
            @change="cornerWidth(row, $event)"
          />
          <span class="text-2xs text-muted-foreground">mm</span>
          <SidebarButton
            v-if="row.cutWidth !== null"
            :data-testid="testId(`piece-corner-inherit-${row.round}`)"
            @click="emit('set-piece-corner-allowance', props.summary.id, row.round, null)"
          >
            Inherit
          </SidebarButton>
          <SidebarButton
            v-if="row.cutWidth !== null || row.inherited !== null"
            :data-testid="testId(`piece-corner-double-${row.round}`)"
            @click="doubleCorner(row)"
          >
            Double
          </SidebarButton>
        </template>
      </li>
    </ul>
  </details>
</template>
