<script setup lang="ts">
import type {
  AllowanceKind,
  BandTarget,
  EntityId,
  ParamInput,
  PatternDocument,
  Piece,
} from '@sewcraft/geometry';
import PieceAllowanceEditor from '@/components/panels/PieceAllowanceEditor.vue';
import PieceParametersForm from '@/components/panels/PieceParametersForm.vue';
import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarHeading from '@/components/sidebar/SidebarHeading.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import { type BulkAllowanceEdit } from '@/lib/allowance-edit';
import type { AllowanceChoice } from '@/lib/allowance-defaults';
import { formatDimensionValue } from '@/lib/dimensions';
import { pieceSizeText, type PieceMarkRow, type PieceSummary } from '@/lib/pieces';

/**
 * The one piece card in the editor: the Pieces drawer and the Properties
 * inspector both render this component, so every edit has a single home.
 */
const props = withDefaults(
  defineProps<{
    summary: PieceSummary;
    /** The stored piece, so the parameter form can edit its new fields. */
    piece: Piece;
    /** The card's heading: `Piece` in the inspector, the piece label in the drawer. */
    label: string;
    /** Prefix for the card's data-testids, so two mounted cards never collide. */
    prefix?: string;
    /** The project default the All edges row starts from when the edges differ. */
    defaultAllowance?: AllowanceChoice;
    /** The preset the piece's own default inherits when it has no override. */
    inheritedDefault?: AllowanceChoice;
    /** The document the piece belongs to, so a formula width resolves. */
    document?: PatternDocument;
    /** The allowance regions selected on the canvas. */
    selectedTargets?: BandTarget[];
    /** The piece's marks, resolved by the parent on every read. */
    marks?: PieceMarkRow[];
  }>(),
  {
    prefix: 'entity',
    defaultAllowance: () => ({ kind: 'seam' as const, width: 10 }),
    inheritedDefault: () => ({ kind: 'seam' as const, width: 10 }),
    selectedTargets: () => [],
    marks: () => [],
  },
);

const emit = defineEmits<{
  'update-piece': [
    id: EntityId,
    patch: {
      name?: string | null;
      quantity?: number | null;
      notes?: string | null;
      fabric?: string | null;
      color?: string | null;
    },
  ];
  'set-piece-default': [
    piece: EntityId,
    value:
      | { mode: 'inherit' }
      | { mode: 'none' }
      | { mode: 'preset'; width: ParamInput; kind: AllowanceKind },
  ];
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
  'remove-piece': [id: EntityId];
  'set-cut-loop': [id: EntityId];
  'clear-cut-loop': [id: EntityId];
  'delete-mark': [id: EntityId];
  'set-notch-depth': [id: EntityId, depth: number | null];
}>();

function forwardAllowance(
  piece: EntityId,
  edge: EntityId,
  value: { kind: AllowanceKind; width: number } | null,
): void {
  emit('set-piece-allowance', piece, edge, value);
}

function forwardAllAllowances(
  piece: EntityId,
  value: { kind: AllowanceKind; width: number } | null,
): void {
  emit('set-all-allowances', piece, value);
}

function forwardCornerAllowance(
  piece: EntityId,
  round: EntityId,
  value: { cutWidth: number } | null,
): void {
  emit('set-piece-corner-allowance', piece, round, value);
}

function testId(suffix: string): string {
  return `${props.prefix}-${suffix}`;
}

/** Area text in square millimetres and square centimetres. */
function areaText(area: number | null | undefined): string {
  if (area === undefined || area === null) return '—';
  return `${formatDimensionValue(area)} mm² (${formatDimensionValue(area / 100)} cm²)`;
}

/** The depth field is a percentage; anything outside 5–90 is clamped. */
function notchDepth(row: PieceMarkRow, event: Event): void {
  const input = event.target as HTMLInputElement;
  const percent = Number(input.value);
  emit('set-notch-depth', row.id, Math.min(90, Math.max(5, percent)) / 100);
}
</script>

<template>
  <section
    class="mt-3 space-y-3 border-t pt-3 first-of-type:mt-0 first-of-type:border-t-0 first-of-type:pt-0"
    :aria-labelledby="testId('piece-heading')"
    :data-testid="testId('piece')"
  >
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-baseline gap-1.5">
        <SidebarHeading
          :id="testId('piece-heading')"
          :label="props.label"
          :data-testid="testId('piece-heading')"
        />
        <span
          class="truncate font-mono text-2xs text-muted-foreground"
          :data-testid="testId('piece-id')"
        >
          {{ props.summary.id }}
        </span>
      </div>
      <SidebarAction
        icon="delete"
        :label="`Remove piece ${props.summary.id}`"
        :data-testid="testId(`remove-piece-${props.summary.id}`)"
        @click="emit('remove-piece', props.summary.id)"
      />
    </div>

    <PieceParametersForm
      :piece="props.piece"
      :document="props.document"
      :inherited="props.inheritedDefault"
      :prefix="props.prefix"
      @update-piece="(patch) => emit('update-piece', props.summary.id, patch)"
      @set-default="(value) => emit('set-piece-default', props.summary.id, value)"
    />

    <dl class="space-y-2">
      <SidebarField label="Finished" :data-testid="testId('piece-finished')">
        {{ props.summary.hasLoop ? pieceSizeText(props.summary.metrics?.finished) : 'No cut loop' }}
      </SidebarField>
      <SidebarField label="Cut" :data-testid="testId('piece-cut')">
        {{ props.summary.hasLoop ? pieceSizeText(props.summary.metrics?.cut) : 'No cut loop' }}
      </SidebarField>
    </dl>

    <div class="flex flex-wrap gap-1.5">
      <SidebarButton
        :data-testid="testId('set-cut-loop')"
        @click="emit('set-cut-loop', props.summary.id)"
      >
        Set cut loop
      </SidebarButton>
      <SidebarButton
        :disabled="!props.summary.hasLoop"
        :data-testid="testId('clear-cut-loop')"
        @click="emit('clear-cut-loop', props.summary.id)"
      >
        Clear cut loop
      </SidebarButton>
    </div>

    <PieceAllowanceEditor
      :summary="props.summary"
      :prefix="props.prefix"
      :default-allowance="props.defaultAllowance"
      :selected-targets="props.selectedTargets"
      @set-piece-allowance="forwardAllowance"
      @set-all-allowances="forwardAllAllowances"
      @set-piece-corner-allowance="forwardCornerAllowance"
      @apply-allowances="emit('apply-allowances', $event)"
    />

    <details v-if="props.marks.length > 0" class="group border-t pt-3">
      <summary
        class="flex cursor-pointer list-none items-center justify-between gap-2 text-2xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden"
      >
        <span>
          Marks
          <span class="ml-1 tabular-nums">{{ props.marks.length }}</span>
        </span>
        <span aria-hidden="true" class="transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <ul class="mt-2 space-y-2" :aria-label="`Marks on piece ${props.summary.id}`">
        <li
          v-for="row in props.marks"
          :key="row.id"
          class="flex flex-wrap items-center gap-1.5 rounded-md px-1 py-0.5"
          :data-testid="testId(`piece-mark-${row.id}`)"
        >
          <span class="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
            {{ row.type === 'notch' ? 'Notch' : row.detail }}
          </span>
          <Pill
            v-if="row.broken"
            tone="neutral"
            :data-testid="testId(`piece-mark-broken-${row.id}`)"
          >
            Broken
          </Pill>
          <template v-if="row.type === 'notch' && !row.broken">
            <SidebarInput
              type="number"
              min="5"
              max="90"
              step="5"
              class="w-16 tabular-nums"
              :value="Math.round(row.depth * 100)"
              :aria-label="`Depth share for notch ${row.id}`"
              :data-testid="testId(`piece-mark-depth-${row.id}`)"
              @change="notchDepth(row, $event)"
            />
            <span class="text-2xs text-muted-foreground">%</span>
            <span
              class="text-2xs tabular-nums text-muted-foreground"
              :data-testid="testId(`piece-mark-reach-${row.id}`)"
            >
              {{ formatDimensionValue(row.cutDistance) }} mm
            </span>
          </template>
          <SidebarButton
            :data-testid="testId(`piece-mark-delete-${row.id}`)"
            @click="emit('delete-mark', row.id)"
          >
            Delete
          </SidebarButton>
        </li>
      </ul>
    </details>

    <details class="group border-t pt-3">
      <summary
        class="flex cursor-pointer list-none items-center justify-between gap-2 text-2xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden"
      >
        <span>Measurements</span>
        <span aria-hidden="true" class="transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <dl class="mt-2 space-y-2">
        <SidebarField label="Cut loop">
          <span :data-testid="testId('piece-loop-state')">
            {{
              props.summary.hasLoop
                ? props.summary.broken
                  ? 'Broken · repair or clear'
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
    </details>
  </section>
</template>
