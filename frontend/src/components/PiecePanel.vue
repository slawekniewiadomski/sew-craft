<script setup lang="ts">
import type { AllowanceKind, EntityId } from '@sewcraft/geometry';

import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarHeading from '@/components/sidebar/SidebarHeading.vue';
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
  }>(),
  { prefix: 'entity' },
);

const emit = defineEmits<{
  'update-piece': [id: EntityId, patch: { name?: string | null; quantity?: number | null }];
  'set-piece-allowance': [
    piece: EntityId,
    edge: EntityId,
    value: { kind: AllowanceKind; width: number } | null,
  ];
  'remove-piece': [id: EntityId];
}>();

/** Allowance kinds offered by the piece editor; `none` removes the allowance. */
const ALLOWANCE_KIND_OPTIONS: { value: AllowanceKind | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'seam', label: 'Seam' },
  { value: 'single', label: 'Single fold' },
  { value: 'double', label: 'Double fold' },
];

const DEFAULT_ALLOWANCE_WIDTH = 10;

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
        {{ pieceSizeText(props.summary.metrics?.finished) }}
      </SidebarField>
      <SidebarField label="Cut" :data-testid="testId('piece-cut')">
        {{ pieceSizeText(props.summary.metrics?.cut) }}
      </SidebarField>
      <SidebarField label="Cut area" :data-testid="testId('piece-cut-area')">
        {{ areaText(props.summary.metrics?.cutArea) }}
      </SidebarField>
      <SidebarField label="Allowance area" :data-testid="testId('piece-allowance-area')">
        {{ areaText(props.summary.metrics?.allowanceArea) }}
      </SidebarField>
    </dl>

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
