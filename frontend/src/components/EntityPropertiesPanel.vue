<script setup lang="ts">
import type {
  AllowanceKind,
  DimensionOrientation,
  DistanceConstraint,
  Entity,
  EntityId,
  PatternDocument,
  SeamSide,
} from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import { Button } from '@/components/ui/button';
import { formatCornerRadius, parseCornerRadius } from '@/lib/corner-round';
import type {
  CornerRoundSummary,
  CutDimensionSummary,
  DimensionSummary,
  EntityProperties,
} from '@/lib/entity-properties';
import {
  DIMENSION_ORIENTATION_OPTIONS,
  dimensionPatchForEdit,
  dimensionStateLabel,
  filterReferenceOptions,
  formatDimensionField,
  formatDimensionValue,
  isReferenceEditText,
  parseDimensionEdit,
  referenceOptions,
  referenceSearchText,
  type DimensionPatch,
  type DimensionReferenceOption,
} from '@/lib/dimensions';
import { parseSeamWidth } from '@/lib/seam-width';
import type { PieceAllowanceRow } from '@/lib/pieces';
import DimensionReferencePicker from './DimensionReferencePicker.vue';

const props = defineProps<{
  /** The live document; the panel never copies it, every render re-reads props. */
  document: PatternDocument;
  entity: EntityProperties;
}>();

const emit = defineEmits<{
  'set-construction': [id: EntityId, construction: boolean];
  'add-seam': [id: EntityId];
  'set-seam-width': [id: EntityId, width: number];
  'flip-seam': [id: EntityId, side: SeamSide];
  'remove-seam': [id: EntityId];
  'update-dimension': [id: EntityId, patch: DimensionPatch];
  'remove-constraint': [id: EntityId];
  'set-corner-round-radius': [id: EntityId, radius: number];
  'remove-corner-round': [id: EntityId];
  'set-circle-radius': [id: EntityId, radius: number];
  'update-piece': [id: EntityId, patch: { name?: string | null; quantity?: number | null }];
  'set-piece-allowance': [
    piece: EntityId,
    edge: EntityId,
    value: { kind: AllowanceKind; width: number } | null,
  ];
  'remove-piece': [id: EntityId];
}>();

/** The `#` picker open in the inspector, if any. */
const picker = ref<{ id: EntityId; text: string; activeIndex: number } | null>(null);

function distanceConstraint(id: EntityId): DistanceConstraint | null {
  const constraint = props.document.constraints.find((entry) => entry.id === id);
  return constraint !== undefined && constraint.type === 'distance' ? constraint : null;
}

/** Filtered rows for the open inspector picker. */
const pickerOptions = computed<DimensionReferenceOption[]>(() => {
  const current = picker.value!;
  const constraint = distanceConstraint(current.id);
  return constraint === null
    ? []
    : filterReferenceOptions(referenceOptions(props.document, constraint), current.text);
});

/** The row Enter would pick, or `null` for an empty list. */
const activePickerOption = computed<DimensionReferenceOption | null>(() => {
  const current = picker.value;
  if (current === null || pickerOptions.value.length === 0) return null;
  return pickerOptions.value[Math.min(current.activeIndex, pickerOptions.value.length - 1)]!;
});

/** The highlighted row, clamped to the filtered list. */
const activePickerIndex = computed<number>(() =>
  activePickerOption.value === null
    ? -1
    : pickerOptions.value.findIndex((option) => option.id === activePickerOption.value!.id),
);

function optionsFor(id: EntityId): DimensionReferenceOption[] {
  const constraint = distanceConstraint(id);
  return constraint === null ? [] : referenceOptions(props.document, constraint);
}

function openPicker(id: EntityId, text = ''): void {
  picker.value = { id, text, activeIndex: 0 };
}

function closePicker(): void {
  picker.value = null;
}

function movePicker(step: number): void {
  const current = picker.value!;
  const count = pickerOptions.value.length;
  if (count === 0) return;
  picker.value = {
    id: current.id,
    text: current.text,
    activeIndex: (current.activeIndex + step + count) % count,
  };
}

function onPickerInput(id: EntityId, event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  if (isReferenceEditText(value)) {
    openPicker(id, referenceSearchText(value));
  } else if (picker.value?.id === id) {
    closePicker();
  }
}

function onPickerKeydown(id: EntityId, event: KeyboardEvent): void {
  const current = picker.value;
  if (current === null || current.id !== id) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    movePicker(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    movePicker(-1);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closePicker();
    return;
  }
  if (event.key === 'Enter' && activePickerOption.value !== null) {
    event.preventDefault();
    linkDimension(id, activePickerOption.value.id);
  }
}

function linkDimension(id: EntityId, reference: EntityId): void {
  closePicker();
  emit('update-dimension', id, { reference });
}

const KIND_LABELS: Record<Entity['kind'], string> = {
  point: 'Point',
  line: 'Line',
  curve: 'Curve',
  arc: 'Arc',
  circle: 'Circle',
};

const KIND_NOUNS: Record<Entity['kind'], string> = {
  point: 'point',
  line: 'line',
  curve: 'curve',
  arc: 'arc',
  circle: 'circle',
};

const kindNoun = computed(() => KIND_NOUNS[props.entity.kind]);

/**
 * The read-only derived arc values. Empty for every other kind and for an arc
 * whose points no longer define a circle, which is exactly when the panel shows
 * its invalid state instead.
 */
const arcRows = computed(() => {
  const arc = props.entity.arc;
  if (arc === null) return [];

  return [
    { key: 'radius', label: 'Radius', value: `${formatDimensionValue(arc.radius)} mm` },
    {
      key: 'angle',
      label: 'Included angle',
      value: `${formatDimensionValue(arc.includedAngle)}°`,
    },
    { key: 'length', label: 'Arc length', value: `${formatDimensionValue(arc.length)} mm` },
  ];
});

function kindLabel(kind: Entity['kind']): string {
  return KIND_LABELS[kind];
}

function orientationLabel(orientation: DimensionOrientation): string {
  return DIMENSION_ORIENTATION_OPTIONS.find((option) => option.value === orientation)!.label;
}

function lengthText(length: number | null): string {
  return length === null ? '—' : `${formatDimensionValue(length)} mm`;
}

function onConstructionChange(event: Event): void {
  emit('set-construction', props.entity.id, (event.target as HTMLInputElement).checked);
}

/** An invalid or unchanged width snaps back without emitting a command. */
function onSeamWidthEdit(id: EntityId, current: number, event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseSeamWidth(input.value);
  if (width === null || width === current) {
    input.value = String(current);
    return;
  }

  emit('set-seam-width', id, width);
}

/** The value field's text: `#source` for a live link, its number otherwise. */
function dimensionFieldText(dimension: DimensionSummary): string {
  const constraint = distanceConstraint(dimension.id);
  return constraint === null
    ? dimension.value === null
      ? ''
      : formatDimensionValue(dimension.value)
    : formatDimensionField(constraint, dimension.value, dimension.state);
}

/** Empty text clears the value back to driven; invalid or unchanged text snaps back. */
function onDimensionValueEdit(dimension: DimensionSummary, event: Event): void {
  const input = event.target as HTMLInputElement;
  const edit = parseDimensionEdit(input.value);
  if (edit.kind === 'invalid') {
    input.value = dimensionFieldText(dimension);
    return;
  }

  const constraint = distanceConstraint(dimension.id);
  const unchangedSet =
    edit.kind === 'set' &&
    dimension.state === 'set' &&
    constraint !== null &&
    constraint.value === edit.value;
  const unchangedDriven = edit.kind === 'driven' && dimension.state === 'driven';
  if (unchangedSet || unchangedDriven) {
    input.value = dimensionFieldText(dimension);
    return;
  }

  const patch = dimensionPatchForEdit(edit, optionsFor(dimension.id));
  if (patch === null) {
    input.value = dimensionFieldText(dimension);
    return;
  }

  closePicker();
  emit('update-dimension', dimension.id, patch);
}

/** An invalid or unchanged radius snaps back without emitting a command. */
function onCornerRadiusEdit(round: CornerRoundSummary, event: Event): void {
  const input = event.target as HTMLInputElement;
  const radius = parseCornerRadius(input.value);
  if (radius === null || radius === round.radius) {
    input.value = formatCornerRadius(round.radius);
    return;
  }

  emit('set-corner-round-radius', round.id, radius);
}

/**
 * Edit a circle's radius. An invalid or unchanged value snaps the field back
 * without emitting a command; a valid one is forwarded for the editor to turn
 * into a rim move or a driving-dimension update.
 */
function onCircleRadiusEdit(event: Event): void {
  const input = event.target as HTMLInputElement;
  const radius = parseCornerRadius(input.value);
  if (radius === null || radius === props.entity.radius) {
    input.value = props.entity.radius === null ? '' : formatCornerRadius(props.entity.radius);
    return;
  }

  emit('set-circle-radius', props.entity.id, radius);
}

/** Allowance kinds offered by the piece editor; `none` removes the allowance. */
const ALLOWANCE_KIND_OPTIONS: { value: AllowanceKind | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'seam', label: 'Seam' },
  { value: 'single', label: 'Single fold' },
  { value: 'double', label: 'Double fold' },
];

const DEFAULT_ALLOWANCE_WIDTH = 10;

/** How a piece size reads in the card: `220 × 210 mm`. */
function sizeText(size: { width: number; height: number } | null | undefined): string {
  return size === undefined || size === null
    ? '—'
    : `${formatDimensionValue(size.width)} × ${formatDimensionValue(size.height)} mm`;
}

/** Area text in square millimetres and square centimetres. */
function areaText(area: number | null | undefined): string {
  if (area === undefined || area === null) return '—';
  return `${formatDimensionValue(area)} mm² (${formatDimensionValue(area / 100)} cm²)`;
}

function allowanceKind(row: PieceAllowanceRow, event: Event): void {
  const kind = (event.target as HTMLSelectElement).value as AllowanceKind | 'none';
  if (kind === 'none') {
    emit('set-piece-allowance', props.entity.piece!.id, row.edge, null);
    return;
  }

  emit('set-piece-allowance', props.entity.piece!.id, row.edge, {
    kind,
    width: row.width > 0 ? row.width : DEFAULT_ALLOWANCE_WIDTH,
  });
}

/** An invalid or unchanged allowance width snaps back without a command. */
function allowanceWidth(row: PieceAllowanceRow, event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseSeamWidth(input.value);
  if (width === null || width === row.width || row.kind === 'none') {
    input.value = row.width > 0 ? String(row.width) : '';
    return;
  }

  emit('set-piece-allowance', props.entity.piece!.id, row.edge, {
    kind: row.kind,
    width,
  });
}

/** Empty text clears the name, mirroring `update_piece`'s `name: null`. */
function pieceName(event: Event): void {
  const input = event.target as HTMLInputElement;
  const name = input.value.trim();
  if (name === (props.entity.piece!.name ?? '')) return;
  emit('update-piece', props.entity.piece!.id, { name: name === '' ? null : name });
}

function pieceQuantity(event: Event): void {
  const input = event.target as HTMLInputElement;
  const quantity = Number(input.value);
  const current = props.entity.piece!.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) {
    input.value = String(current);
    return;
  }
  if (quantity === current) return;
  emit('update-piece', props.entity.piece!.id, { quantity });
}

function cutDimensionValue(dimension: CutDimensionSummary): string {
  return dimension.value === null ? '—' : `${formatDimensionValue(dimension.value)} mm`;
}

function removeCutDimension(dimension: CutDimensionSummary): void {
  emit('remove-constraint', dimension.id);
}
</script>

<template>
  <section
    class="space-y-3 text-sm"
    aria-labelledby="entity-properties-heading"
    data-testid="entity-properties"
  >
    <header class="flex flex-wrap items-center gap-2">
      <h2 id="entity-properties-heading" class="font-semibold">
        {{ kindLabel(props.entity.kind) }}
        <span class="font-mono text-muted-foreground">{{ props.entity.id }}</span>
      </h2>
      <span
        v-if="props.entity.construction"
        class="rounded-sm border px-1 text-xs text-muted-foreground"
      >
        Construction
      </span>
    </header>

    <p
      v-if="props.entity.geometry.kind !== 'point'"
      class="text-xs text-muted-foreground"
      data-testid="entity-scope-hint"
    >
      Showing what acts on this {{ kindNoun }}. Select a point to see its constraints.
    </p>

    <section aria-labelledby="entity-geometry-heading">
      <h3
        id="entity-geometry-heading"
        class="text-xs font-semibold uppercase text-muted-foreground"
      >
        Geometry
      </h3>
      <dl class="mt-1 space-y-1">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Kind</dt>
          <dd data-testid="entity-kind">{{ kindLabel(props.entity.kind) }}</dd>
        </div>

        <template v-if="props.entity.geometry.kind === 'point'">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">X</dt>
            <dd>{{ formatDimensionValue(props.entity.geometry.x) }} mm</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Y</dt>
            <dd>{{ formatDimensionValue(props.entity.geometry.y) }} mm</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Fixed</dt>
            <dd data-testid="entity-fixed">{{ props.entity.fixed ? 'Yes' : 'No' }}</dd>
          </div>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'line'">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Start</dt>
            <dd class="font-mono">{{ props.entity.geometry.start }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">End</dt>
            <dd class="font-mono">{{ props.entity.geometry.end }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Length</dt>
            <dd data-testid="entity-length">{{ lengthText(props.entity.length) }}</dd>
          </div>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'arc'">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Start</dt>
            <dd class="font-mono">{{ props.entity.geometry.start }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">End</dt>
            <dd class="font-mono">{{ props.entity.geometry.end }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Through</dt>
            <dd class="font-mono">{{ props.entity.geometry.through }}</dd>
          </div>
          <div
            v-for="row in arcRows"
            :key="row.key"
            class="flex items-center justify-between gap-2"
            :data-testid="`entity-arc-${row.key}`"
          >
            <dt class="text-muted-foreground">{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
          <p
            v-if="arcRows.length === 0"
            class="text-xs text-destructive"
            data-testid="entity-arc-invalid"
          >
            Invalid: the three points are collinear.
          </p>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'curve'">
          <div
            v-for="point in ['p0', 'p1', 'p2', 'p3'] as const"
            :key="point"
            class="flex items-center justify-between gap-2"
          >
            <dt class="uppercase text-muted-foreground">{{ point }}</dt>
            <dd class="font-mono">{{ props.entity.geometry[point] }}</dd>
          </div>
        </template>

        <template v-else>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Centre</dt>
            <dd class="font-mono" data-testid="entity-circle-center">
              {{ props.entity.geometry.center }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Rim</dt>
            <dd class="font-mono" data-testid="entity-circle-rim">
              {{ props.entity.geometry.rim }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Radius</dt>
            <dd class="flex items-center gap-1">
              <input
                type="number"
                min="0.001"
                step="0.001"
                class="w-24 rounded-md border px-2 py-1 text-sm text-foreground"
                :value="props.entity.radius === null ? '' : formatCornerRadius(props.entity.radius)"
                :aria-label="`Radius for circle ${props.entity.id} (mm)`"
                data-testid="entity-circle-radius"
                @change="onCircleRadiusEdit"
              />
              <span class="text-xs text-muted-foreground">mm</span>
            </dd>
          </div>
        </template>

        <div class="flex items-center justify-between gap-2">
          <label :for="`entity-construction-${props.entity.id}`" class="text-muted-foreground">
            Construction
          </label>
          <input
            :id="`entity-construction-${props.entity.id}`"
            type="checkbox"
            :checked="props.entity.construction"
            :aria-label="`Construction for ${props.entity.id}`"
            data-testid="entity-construction"
            @change="onConstructionChange"
          />
        </div>
      </dl>
    </section>

    <section
      v-if="props.entity.piece"
      aria-labelledby="entity-piece-heading"
      data-testid="entity-piece"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 id="entity-piece-heading" class="text-xs font-semibold uppercase text-muted-foreground">
          Piece
        </h3>
        <Button
          variant="outline"
          size="sm"
          :aria-label="`Remove piece ${props.entity.piece.id}`"
          :data-testid="`entity-remove-piece-${props.entity.piece.id}`"
          @click="emit('remove-piece', props.entity.piece!.id)"
        >
          Remove piece
        </Button>
      </div>

      <dl class="mt-1 space-y-1">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Id</dt>
          <dd class="font-mono" data-testid="entity-piece-id">{{ props.entity.piece.id }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Name</dt>
          <dd>
            <input
              type="text"
              class="w-40 rounded-md border px-2 py-1 text-sm"
              :value="props.entity.piece.name ?? ''"
              :aria-label="`Name for piece ${props.entity.piece.id}`"
              data-testid="entity-piece-name"
              @change="pieceName"
            />
          </dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Quantity</dt>
          <dd>
            <input
              type="number"
              min="1"
              step="1"
              class="w-20 rounded-md border px-2 py-1 text-sm"
              :value="props.entity.piece.quantity"
              :aria-label="`Quantity for piece ${props.entity.piece.id}`"
              data-testid="entity-piece-quantity"
              @change="pieceQuantity"
            />
          </dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Finished</dt>
          <dd data-testid="entity-piece-finished">
            {{ sizeText(props.entity.piece.metrics?.finished) }}
          </dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Cut</dt>
          <dd data-testid="entity-piece-cut">{{ sizeText(props.entity.piece.metrics?.cut) }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Cut area</dt>
          <dd data-testid="entity-piece-cut-area">
            {{ areaText(props.entity.piece.metrics?.cutArea) }}
          </dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Allowance area</dt>
          <dd data-testid="entity-piece-allowance-area">
            {{ areaText(props.entity.piece.metrics?.allowanceArea) }}
          </dd>
        </div>
      </dl>

      <ul class="mt-2 space-y-2" :aria-label="`Allowances for piece ${props.entity.piece.id}`">
        <li
          v-for="row in props.entity.piece.allowances"
          :key="row.edge"
          class="flex flex-wrap items-center gap-2"
          :data-testid="`entity-piece-allowance-${row.edge}`"
        >
          <span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {{ row.edge }}
          </span>
          <select
            class="rounded-md border px-2 py-1 text-sm"
            :value="row.kind"
            :aria-label="`Allowance kind for edge ${row.edge}`"
            :data-testid="`entity-piece-kind-${row.edge}`"
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
            class="w-16 rounded-md border px-2 py-1 text-sm"
            :value="row.width > 0 ? row.width : ''"
            :disabled="row.kind === 'none'"
            :aria-label="`Finished width for edge ${row.edge}`"
            :data-testid="`entity-piece-width-${row.edge}`"
            @change="allowanceWidth(row, $event)"
          />
          <span class="text-xs text-muted-foreground">mm</span>
        </li>
      </ul>
    </section>

    <section
      v-if="props.entity.rounds.length > 0"
      aria-labelledby="entity-corner-rounds-heading"
      data-testid="entity-corner-rounds"
    >
      <h3
        id="entity-corner-rounds-heading"
        class="text-xs font-semibold uppercase text-muted-foreground"
      >
        Corner round
      </h3>
      <ul class="mt-1 space-y-2" :aria-label="`Corner rounds for ${props.entity.id}`">
        <li
          v-for="round in props.entity.rounds"
          :key="round.id"
          class="space-y-1"
          :data-testid="`entity-corner-round-${round.id}`"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <span class="font-mono text-muted-foreground">{{ round.id }}</span>
              <span class="ml-2 text-xs text-muted-foreground">
                corner {{ round.corner }} · anchors {{ round.anchors.join(', ') }}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              :aria-label="`Remove corner round ${round.id}`"
              :data-testid="`entity-remove-corner-round-${round.id}`"
              @click="emit('remove-corner-round', round.id)"
            >
              Remove
            </Button>
          </div>

          <label class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted-foreground">Radius</span>
            <input
              type="number"
              min="0.001"
              step="0.001"
              class="w-24 rounded-md border px-2 py-1"
              :value="formatCornerRadius(round.radius)"
              :aria-label="`Radius for corner round ${round.id} (mm)`"
              :data-testid="`entity-corner-radius-${round.id}`"
              @change="onCornerRadiusEdit(round, $event)"
            />
            <span class="text-xs text-muted-foreground">mm</span>
          </label>
        </li>
      </ul>
    </section>

    <section aria-labelledby="entity-dimensions-heading">
      <h3
        id="entity-dimensions-heading"
        class="text-xs font-semibold uppercase text-muted-foreground"
      >
        Dimensions
      </h3>
      <ul
        v-if="props.entity.dimensions.length > 0"
        class="mt-1 space-y-2"
        :aria-label="`Dimensions for ${props.entity.id}`"
      >
        <li
          v-for="dimension in props.entity.dimensions"
          :key="dimension.id"
          class="space-y-1"
          :data-testid="`entity-dimension-${dimension.id}`"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <span class="font-mono text-muted-foreground">{{ dimension.id }}</span>
              <span class="ml-2 text-xs text-muted-foreground">
                {{ orientationLabel(dimension.orientation) }} · {{ dimension.entities.join(', ') }}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              :aria-label="`Remove dimension ${dimension.id}`"
              :data-testid="`entity-remove-dimension-${dimension.id}`"
              @click="emit('remove-constraint', dimension.id)"
            >
              Remove
            </Button>
          </div>

          <label class="relative flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted-foreground">Value</span>
            <input
              type="text"
              inputmode="decimal"
              class="w-20 rounded-md border px-2 py-1"
              :value="dimensionFieldText(dimension)"
              :aria-label="`Value for dimension ${dimension.id} on ${props.entity.id} (${dimensionStateLabel(dimension.state).toLowerCase()})`"
              :data-testid="`entity-dimension-value-${dimension.id}`"
              role="combobox"
              aria-autocomplete="list"
              :aria-expanded="picker?.id === dimension.id"
              :aria-controls="
                picker?.id === dimension.id
                  ? `entity-dimension-reference-list-${dimension.id}`
                  : undefined
              "
              :aria-activedescendant="
                picker?.id === dimension.id && activePickerOption !== null
                  ? `entity-dimension-reference-list-${dimension.id}-${activePickerOption.id}`
                  : undefined
              "
              @input="onPickerInput(dimension.id, $event)"
              @keydown="onPickerKeydown(dimension.id, $event)"
              @change="onDimensionValueEdit(dimension, $event)"
            />
            <span class="text-xs text-muted-foreground">mm</span>
            <span
              class="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
              :data-dimension-state="dimension.state"
              :data-testid="`entity-dimension-state-${dimension.id}`"
            >
              {{ dimensionStateLabel(dimension.state) }}
            </span>
            <Button
              variant="outline"
              size="sm"
              :data-testid="`entity-dimension-reference-${dimension.id}`"
              @click="openPicker(dimension.id)"
            >
              {{ dimension.state === 'broken' ? 'Re-link' : 'Reference' }}
            </Button>
            <Button
              v-if="dimension.sourceId !== null"
              variant="outline"
              size="sm"
              :data-testid="`entity-dimension-unlink-${dimension.id}`"
              @click="emit('update-dimension', dimension.id, { reference: null })"
            >
              Remove reference
            </Button>

            <DimensionReferencePicker
              v-if="picker?.id === dimension.id"
              :list-id="`entity-dimension-reference-list-${dimension.id}`"
              class="left-0 top-full mt-1"
              :options="pickerOptions"
              :active-index="activePickerIndex"
              @select="linkDimension(dimension.id, $event)"
            />
          </label>

          <p
            v-if="dimension.state === 'referenced'"
            class="text-xs text-muted-foreground"
            :data-testid="`entity-dimension-source-${dimension.id}`"
          >
            Source: <span class="font-mono">{{ dimension.sourceId }}</span>
          </p>
          <p
            v-else-if="dimension.state === 'broken'"
            class="text-xs text-destructive"
            :data-testid="`entity-dimension-broken-${dimension.id}`"
          >
            Source {{ dimension.sourceId }} is missing. Type a value or press # to re-link.
          </p>
        </li>
      </ul>
      <ul
        v-if="props.entity.cutDimensions.length > 0"
        class="mt-2 space-y-2"
        :aria-label="`Cut dimensions for ${props.entity.id}`"
      >
        <li
          v-for="dimension in props.entity.cutDimensions"
          :key="dimension.id"
          class="space-y-1"
          :data-testid="`entity-cut-dimension-${dimension.id}`"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <span class="font-mono text-muted-foreground">{{ dimension.id }}</span>
              <span class="ml-2 text-xs text-muted-foreground">
                piece {{ dimension.piece }} · {{ dimension.anchors.join(' → ') }}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              :aria-label="`Remove cut dimension ${dimension.id}`"
              :data-testid="`entity-remove-cut-dimension-${dimension.id}`"
              @click="removeCutDimension(dimension)"
            >
              Remove
            </Button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input
              type="text"
              class="w-24 rounded-md border bg-muted px-2 py-1 text-sm"
              :value="cutDimensionValue(dimension)"
              readonly
              :aria-label="`Cut dimension ${dimension.id} (read-only)`"
              :data-testid="`entity-cut-dimension-value-${dimension.id}`"
            />
            <span
              class="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
              :data-dimension-state="dimension.state"
            >
              {{ dimension.state === 'broken' ? 'Broken' : 'Cut' }}
            </span>
          </div>
          <p class="text-xs text-muted-foreground">
            Read-only: it follows the stitch dimension and the allowance widths.
          </p>
        </li>
      </ul>
      <p
        v-if="props.entity.dimensions.length === 0 && props.entity.cutDimensions.length === 0"
        class="mt-1 text-xs text-muted-foreground"
      >
        No dimensions on this {{ kindNoun }}.
      </p>
    </section>

    <section aria-labelledby="entity-constraints-heading">
      <h3
        id="entity-constraints-heading"
        class="text-xs font-semibold uppercase text-muted-foreground"
      >
        Constraints
      </h3>
      <ul
        v-if="props.entity.constraints.length > 0"
        class="mt-1 space-y-2"
        :aria-label="`Constraints for ${props.entity.id}`"
      >
        <li
          v-for="constraint in props.entity.constraints"
          :key="constraint.id"
          class="flex flex-wrap items-center justify-between gap-2"
          :data-testid="`entity-constraint-${constraint.id}`"
        >
          <div class="min-w-0">
            <span class="font-mono text-muted-foreground">{{ constraint.id }}</span>
            <span class="ml-2">{{ constraint.label }}</span>
            <span class="ml-2 text-xs text-muted-foreground">
              ({{ constraint.entities.join(', ') }})
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            :aria-label="`Remove constraint ${constraint.id}`"
            :data-testid="`entity-remove-constraint-${constraint.id}`"
            @click="emit('remove-constraint', constraint.id)"
          >
            Remove
          </Button>
        </li>
      </ul>
      <p v-else class="mt-1 text-xs text-muted-foreground">
        No constraints on this {{ kindNoun }}.
      </p>
    </section>

    <section
      v-if="
        props.entity.piece === null &&
        props.entity.geometry.kind !== 'point' &&
        props.entity.geometry.kind !== 'circle'
      "
      aria-labelledby="entity-seam-heading"
      data-testid="entity-seam"
    >
      <h3 id="entity-seam-heading" class="text-xs font-semibold uppercase text-muted-foreground">
        Seam allowance
      </h3>

      <div v-if="props.entity.seam" class="mt-1 flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-1 text-muted-foreground">
          Allowance
          <input
            type="number"
            min="0.1"
            step="0.1"
            class="w-16 rounded-md border px-2 py-1 text-sm text-foreground"
            :value="props.entity.seam.width"
            :aria-label="`Allowance width in millimetres for ${props.entity.id}`"
            data-testid="entity-seam-width"
            @change="onSeamWidthEdit(props.entity.seam!.id, props.entity.seam!.width, $event)"
            @keydown.enter.prevent="
              onSeamWidthEdit(props.entity.seam!.id, props.entity.seam!.width, $event)
            "
          />
          mm
        </label>
        <Button
          variant="outline"
          size="sm"
          :aria-label="`Flip side of the seam allowance for ${props.entity.id}`"
          data-testid="entity-flip-seam"
          @click="emit('flip-seam', props.entity.seam!.id, props.entity.seam!.side)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8" />
            <path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13" />
          </svg>
          Flip side
        </Button>
        <Button
          variant="outline"
          size="sm"
          :aria-label="`Remove allowance from ${props.entity.id}`"
          data-testid="entity-remove-seam"
          @click="emit('remove-seam', props.entity.seam!.id)"
        >
          Remove
        </Button>
      </div>

      <p
        v-else-if="props.entity.construction"
        class="mt-1 text-xs text-muted-foreground"
        data-testid="entity-seam-construction"
      >
        Allowances apply to cut edges only.
      </p>

      <Button
        v-else
        variant="outline"
        size="sm"
        class="mt-1"
        :aria-label="`Add allowance to ${props.entity.id}`"
        data-testid="entity-add-seam"
        @click="emit('add-seam', props.entity.id)"
      >
        Add allowance
      </Button>
    </section>
  </section>
</template>
