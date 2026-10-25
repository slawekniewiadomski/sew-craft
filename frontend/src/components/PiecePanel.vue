<script setup lang="ts">
import type { AllowanceKind, EntityId } from '@sewcraft/geometry';
import { computed, ref, watch } from 'vue';

import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarHeading from '@/components/sidebar/SidebarHeading.vue';
import type { AllowanceChoice } from '@/lib/allowance-defaults';
import { parseAllowanceWidth } from '@/lib/allowance-width';
import { formatDimensionValue } from '@/lib/dimensions';
import { pieceSizeText, type PieceAllowanceRow, type PieceSummary } from '@/lib/pieces';

/**
 * The one piece card in the editor: the Pieces drawer and the Properties
 * inspector both render this component, so every edit has a single home.
 */
const props = withDefaults(
  defineProps<{
    summary: PieceSummary;
    /** The card's heading: `Piece` in the inspector, the piece label in the drawer. */
    label: string;
    /** Prefix for the card's data-testids, so two mounted cards never collide. */
    prefix?: string;
    /** The project default the All edges row starts from when the edges differ. */
    defaultAllowance?: AllowanceChoice;
    /** Whether this is the active piece every new entity belongs to. */
    active?: boolean;
    /** Whether the Move gesture is armed for this piece. */
    moveMode?: boolean;
  }>(),
  {
    prefix: 'entity',
    defaultAllowance: () => ({ kind: 'seam' as const, width: 10 }),
    active: false,
    moveMode: false,
  },
);

const emit = defineEmits<{
  'update-piece': [id: EntityId, patch: { name?: string | null; quantity?: number | null }];
  'set-piece-allowance': [
    piece: EntityId,
    edge: EntityId,
    value: { kind: AllowanceKind; width: number } | null,
  ];
  'set-all-allowances': [piece: EntityId, value: { kind: AllowanceKind; width: number } | null];
  'remove-piece': [id: EntityId];
  'set-cut-loop': [id: EntityId];
  'clear-cut-loop': [id: EntityId];
  'toggle-move': [id: EntityId];
  'activate': [id: EntityId];
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

/** Area text in square millimetres and square centimetres. */
function areaText(area: number | null | undefined): string {
  if (area === undefined || area === null) return '—';
  return `${formatDimensionValue(area)} mm² (${formatDimensionValue(area / 100)} cm²)`;
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

/** Apply writes one value to every edge in a single grouped dispatch. */
function applyAll(): void {
  emit(
    'set-all-allowances',
    props.summary.id,
    allKind.value === 'none' ? null : { kind: allKind.value, width: allWidth.value },
  );
}

/** Empty text clears the name, mirroring `update_piece`'s `name: null`. */
function pieceName(event: Event): void {
  const input = event.target as HTMLInputElement;
  const name = input.value.trim();
  if (name === (props.summary.name ?? '')) return;
  emit('update-piece', props.summary.id, { name: name === '' ? null : name });
}

function pieceQuantity(event: Event): void {
  const input = event.target as HTMLInputElement;
  const quantity = Number(input.value);
  if (!Number.isInteger(quantity) || quantity < 1) {
    input.value = String(props.summary.quantity);
    return;
  }
  if (quantity === props.summary.quantity) return;
  emit('update-piece', props.summary.id, { quantity });
}
</script>

<template>
  <section
    class="space-y-2 rounded-md border p-2.5"
    :class="props.active ? 'border-primary ring-1 ring-primary' : ''"
    :aria-labelledby="testId('piece-heading')"
    :data-testid="testId('piece')"
  >
    <div class="flex items-center justify-between gap-2">
      <SidebarHeading
        :id="testId('piece-heading')"
        :label="props.label"
        :data-testid="testId('piece-heading')"
      />
      <SidebarAction
        icon="delete"
        :label="`Remove piece ${props.summary.id}`"
        :data-testid="testId(`remove-piece-${props.summary.id}`)"
        @click="emit('remove-piece', props.summary.id)"
      />
    </div>

    <dl class="space-y-1">
      <SidebarField label="Id" mono :data-testid="testId('piece-id')">
        {{ props.summary.id }}
      </SidebarField>
      <SidebarField label="Name">
        <input
          type="text"
          class="h-7 w-40 rounded-sm border px-2 text-[13px]"
          :value="props.summary.name ?? ''"
          :aria-label="`Name for piece ${props.summary.id}`"
          :data-testid="testId('piece-name')"
          @change="pieceName"
        />
      </SidebarField>
      <SidebarField label="Quantity">
        <input
          type="number"
          min="1"
          step="1"
          class="h-7 w-20 rounded-sm border px-2 text-[13px] tabular-nums"
          :value="props.summary.quantity"
          :aria-label="`Quantity for piece ${props.summary.id}`"
          :data-testid="testId('piece-quantity')"
          @change="pieceQuantity"
        />
      </SidebarField>
      <SidebarField label="Finished" :data-testid="testId('piece-finished')">
        {{ props.summary.hasLoop ? pieceSizeText(props.summary.metrics?.finished) : 'No cut loop' }}
      </SidebarField>
      <SidebarField label="Cut" :data-testid="testId('piece-cut')">
        {{ props.summary.hasLoop ? pieceSizeText(props.summary.metrics?.cut) : 'No cut loop' }}
      </SidebarField>
      <SidebarField label="Cut loop">
        <span :data-testid="testId('piece-loop-state')">
          {{
            props.summary.hasLoop
              ? props.summary.broken
                ? 'Cut loop broken · repair or clear'
                : 'Captured'
              : 'No cut loop'
          }}
        </span>
      </SidebarField>
      <SidebarField label="Owned">
        <span :data-testid="testId('piece-entity-count')">
          {{ props.summary.entityCount }} entities
        </span>
      </SidebarField>
      <SidebarField label="Cut area" :data-testid="testId('piece-cut-area')">
        {{ areaText(props.summary.metrics?.cutArea) }}
      </SidebarField>
      <SidebarField label="Allowance area" :data-testid="testId('piece-allowance-area')">
        {{ areaText(props.summary.metrics?.allowanceArea) }}
      </SidebarField>
    </dl>

    <div class="flex flex-wrap gap-1.5 border-t pt-2">
      <button
        type="button"
        class="h-7 rounded-sm border px-2 text-2xs font-medium"
        :data-testid="testId('set-cut-loop')"
        @click="emit('set-cut-loop', props.summary.id)"
      >
        Set cut loop
      </button>
      <button
        type="button"
        class="h-7 rounded-sm border px-2 text-2xs font-medium disabled:opacity-50"
        :disabled="!props.summary.hasLoop"
        :data-testid="testId('clear-cut-loop')"
        @click="emit('clear-cut-loop', props.summary.id)"
      >
        Clear cut loop
      </button>
      <button
        type="button"
        class="h-7 rounded-sm border px-2 text-2xs font-medium"
        :aria-pressed="props.moveMode ? 'true' : 'false'"
        :class="props.moveMode ? 'bg-accent text-accent-foreground' : ''"
        :data-testid="testId('piece-move-toggle')"
        @click="emit('toggle-move', props.summary.id)"
      >
        Move
      </button>
      <button
        type="button"
        class="h-7 rounded-sm border px-2 text-2xs font-medium"
        :class="props.active ? 'bg-primary text-primary-foreground' : ''"
        :data-testid="testId('piece-activate')"
        @click="emit('activate', props.summary.id)"
      >
        {{ props.active ? 'Active' : 'Make active' }}
      </button>
    </div>

    <div class="space-y-1.5 border-t pt-2" data-testid="piece-all">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="min-w-0 flex-1 text-2xs text-muted-foreground">All edges</span>
        <select
          class="h-7 rounded-sm border px-1.5 text-2xs"
          :value="allKind"
          :aria-label="`Allowance kind for all edges of piece ${props.summary.id}`"
          :data-testid="testId('piece-all-kind')"
          @change="allKindChanged"
        >
          <option
            v-for="option in ALLOWANCE_KIND_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <input
          type="number"
          min="0.1"
          step="0.1"
          class="h-7 w-16 rounded-sm border px-1.5 text-2xs tabular-nums"
          :value="allKind === 'none' ? '' : allWidth"
          :disabled="allKind === 'none'"
          :aria-label="`Finished width for all edges of piece ${props.summary.id}`"
          :data-testid="testId('piece-all-width')"
          @change="allWidthChanged"
        />
        <span class="text-2xs text-muted-foreground">mm</span>
        <button
          type="button"
          class="h-7 rounded-sm border px-2 text-2xs font-medium disabled:opacity-50"
          :disabled="!canApplyAll"
          :data-testid="testId('piece-all-apply')"
          @click="applyAll"
        >
          Apply
        </button>
      </div>
      <span v-if="allMixed" :data-testid="testId('piece-all-mixed')">
        <Pill tone="neutral">Mixed</Pill>
      </span>
    </div>

    <ul class="space-y-1.5 border-t pt-2" :aria-label="`Allowances for piece ${props.summary.id}`">
      <li
        v-for="row in props.summary.allowances"
        :key="row.edge"
        class="flex flex-wrap items-center gap-1.5"
        :data-testid="testId(`piece-allowance-${row.edge}`)"
      >
        <span class="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">
          {{ row.edge }}
        </span>
        <select
          class="h-7 rounded-sm border px-1.5 text-2xs"
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
        </select>
        <input
          type="number"
          min="0.1"
          step="0.1"
          class="h-7 w-16 rounded-sm border px-1.5 text-2xs tabular-nums"
          :value="row.width > 0 ? row.width : ''"
          :disabled="row.kind === 'none'"
          :aria-label="`Finished width for edge ${row.edge}`"
          :data-testid="testId(`piece-width-${row.edge}`)"
          @change="allowanceWidth(row, $event)"
        />
        <span class="text-2xs text-muted-foreground">mm</span>
      </li>
    </ul>
  </section>
</template>
