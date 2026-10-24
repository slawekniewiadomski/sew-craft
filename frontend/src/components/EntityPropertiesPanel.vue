<script setup lang="ts">
import type {
  AllowanceKind,
  DimensionOrientation,
  DistanceConstraint,
  Entity,
  EntityId,
  PatternDocument,
} from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import RibbonIcon from '@/components/RibbonIcon.vue';
import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarHeading from '@/components/sidebar/SidebarHeading.vue';
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
  anchorLabel,
  dimensionPatchForEdit,
  dimensionStateLabel,
  dimensionTone,
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
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';
import DimensionReferencePicker from './DimensionReferencePicker.vue';
import { defaultAllowanceSummary } from '@/lib/allowance-defaults';

import PiecePanel from './PiecePanel.vue';

const props = defineProps<{
  /** The live document; the panel never copies it, every render re-reads props. */
  document: PatternDocument;
  entity: EntityProperties;
}>();

const emit = defineEmits<{
  'set-construction': [id: EntityId, construction: boolean];
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
  'set-all-allowances': [piece: EntityId, value: { kind: AllowanceKind; width: number } | null];
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
  text: 'Text',
};

const KIND_NOUNS: Record<Entity['kind'], string> = {
  point: 'point',
  line: 'line',
  curve: 'curve',
  arc: 'arc',
  circle: 'circle',
  text: 'text',
};

const KIND_ICONS: Record<Entity['kind'], RibbonIconName> = {
  point: 'point',
  line: 'line',
  curve: 'curve',
  arc: 'arc',
  circle: 'circle',
  text: 'text',
};

const kindNoun = computed(() => KIND_NOUNS[props.entity.kind]);
const kindIcon = computed(() => ribbonIcon(KIND_ICONS[props.entity.kind]));

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

function cutDimensionValue(dimension: CutDimensionSummary): string {
  return dimension.value === null ? '—' : `${formatDimensionValue(dimension.value)} mm`;
}

function removeCutDimension(dimension: CutDimensionSummary): void {
  emit('remove-constraint', dimension.id);
}
</script>

<template>
  <section
    class="space-y-3"
    aria-labelledby="entity-properties-heading"
    data-testid="entity-properties"
  >
    <header class="flex flex-wrap items-center gap-1.5">
      <h2
        id="entity-properties-heading"
        class="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold"
      >
        <RibbonIcon :icon="kindIcon" :size="14" class="shrink-0 text-muted-foreground" />
        <span class="truncate">{{ kindLabel(props.entity.kind) }}</span>
        <span class="font-mono text-2xs font-normal text-muted-foreground">
          {{ props.entity.id }}
        </span>
      </h2>
      <Pill v-if="props.entity.construction" tone="neutral">Construction</Pill>
    </header>

    <p
      v-if="props.entity.geometry.kind !== 'point'"
      class="text-2xs leading-snug text-muted-foreground"
      data-testid="entity-scope-hint"
    >
      Showing what acts on this {{ kindNoun }}. Select a point to see its constraints.
    </p>

    <section aria-labelledby="entity-geometry-heading">
      <SidebarHeading id="entity-geometry-heading" label="Geometry" />
      <dl class="space-y-1">
        <SidebarField label="Kind" data-testid="entity-kind">
          {{ kindLabel(props.entity.kind) }}
        </SidebarField>

        <template v-if="props.entity.geometry.kind === 'point'">
          <SidebarField label="X" data-testid="entity-x">
            {{ formatDimensionValue(props.entity.geometry.x)
            }}<span class="text-2xs text-muted-foreground"> mm</span>
          </SidebarField>
          <SidebarField label="Y" data-testid="entity-y">
            {{ formatDimensionValue(props.entity.geometry.y)
            }}<span class="text-2xs text-muted-foreground"> mm</span>
          </SidebarField>
          <SidebarField label="Fixed" data-testid="entity-fixed">
            {{ props.entity.fixed ? 'Yes' : 'No' }}
          </SidebarField>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'line'">
          <SidebarField label="Start" mono data-testid="entity-start">
            {{ props.entity.geometry.start }}
          </SidebarField>
          <SidebarField label="End" mono data-testid="entity-end">
            {{ props.entity.geometry.end }}
          </SidebarField>
          <SidebarField label="Length" data-testid="entity-length">
            {{ lengthText(props.entity.length) }}
          </SidebarField>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'arc'">
          <SidebarField label="Start" mono data-testid="entity-start">
            {{ props.entity.geometry.start }}
          </SidebarField>
          <SidebarField label="End" mono data-testid="entity-end">
            {{ props.entity.geometry.end }}
          </SidebarField>
          <SidebarField label="Through" mono data-testid="entity-through">
            {{ props.entity.geometry.through }}
          </SidebarField>
          <SidebarField
            v-for="row in arcRows"
            :key="row.key"
            :label="row.label"
            :data-testid="`entity-arc-${row.key}`"
          >
            {{ row.value }}
          </SidebarField>
          <p
            v-if="arcRows.length === 0"
            class="text-2xs text-destructive"
            data-testid="entity-arc-invalid"
          >
            Invalid: the three points are collinear.
          </p>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'curve'">
          <SidebarField
            v-for="point in ['p0', 'p1', 'p2', 'p3'] as const"
            :key="point"
            :label="point"
            mono
          >
            {{ props.entity.geometry[point] }}
          </SidebarField>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'circle'">
          <SidebarField label="Centre" mono data-testid="entity-circle-center">
            {{ props.entity.geometry.center }}
          </SidebarField>
          <SidebarField label="Rim" mono data-testid="entity-circle-rim">
            {{ props.entity.geometry.rim }}
          </SidebarField>
          <SidebarField label="Radius">
            <span class="inline-flex items-center gap-1">
              <input
                type="number"
                min="0.001"
                step="0.001"
                class="h-7 w-24 rounded-sm border px-2 text-[13px] tabular-nums"
                :value="props.entity.radius === null ? '' : formatCornerRadius(props.entity.radius)"
                :aria-label="`Radius for circle ${props.entity.id} (mm)`"
                data-testid="entity-circle-radius"
                @change="onCircleRadiusEdit"
              />
              <span class="text-2xs text-muted-foreground">mm</span>
            </span>
          </SidebarField>
        </template>

        <div class="flex items-center justify-between gap-2">
          <label
            :for="`entity-construction-${props.entity.id}`"
            class="text-2xs text-muted-foreground"
          >
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

    <PiecePanel
      v-if="props.entity.piece"
      :summary="props.entity.piece"
      :default-allowance="defaultAllowanceSummary(props.document)"
      label="Piece"
      @update-piece="(id, patch) => emit('update-piece', id, patch)"
      @set-piece-allowance="(piece, edge, value) => emit('set-piece-allowance', piece, edge, value)"
      @set-all-allowances="(piece, value) => emit('set-all-allowances', piece, value)"
      @remove-piece="(id) => emit('remove-piece', id)"
    />

    <section
      v-if="props.entity.rounds.length > 0"
      aria-labelledby="entity-corner-rounds-heading"
      data-testid="entity-corner-rounds"
    >
      <SidebarHeading id="entity-corner-rounds-heading" label="Corner round" />
      <ul class="space-y-2" :aria-label="`Corner rounds for ${props.entity.id}`">
        <li
          v-for="round in props.entity.rounds"
          :key="round.id"
          class="space-y-1 border-t pt-2"
          :data-testid="`entity-corner-round-${round.id}`"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <span class="font-mono text-2xs text-muted-foreground">{{ round.id }}</span>
              <span class="ml-1.5 text-2xs text-muted-foreground">
                corner {{ round.corner }} · anchors {{ round.anchors.join(', ') }}
              </span>
            </div>
            <SidebarAction
              icon="delete"
              :label="`Remove corner round ${round.id}`"
              :data-testid="`entity-remove-corner-round-${round.id}`"
              @click="emit('remove-corner-round', round.id)"
            />
          </div>

          <label class="flex flex-wrap items-center gap-1.5">
            <span class="text-2xs text-muted-foreground">Radius</span>
            <input
              type="number"
              min="0.001"
              step="0.001"
              class="h-7 w-24 rounded-sm border px-2 text-[13px] tabular-nums"
              :value="formatCornerRadius(round.radius)"
              :aria-label="`Radius for corner round ${round.id} (mm)`"
              :data-testid="`entity-corner-radius-${round.id}`"
              @change="onCornerRadiusEdit(round, $event)"
            />
            <span class="text-2xs text-muted-foreground">mm</span>
          </label>
        </li>
      </ul>
    </section>

    <section aria-labelledby="entity-dimensions-heading">
      <SidebarHeading id="entity-dimensions-heading" label="Dimensions" />
      <ul
        v-if="props.entity.dimensions.length > 0"
        class="space-y-2"
        :aria-label="`Dimensions for ${props.entity.id}`"
      >
        <li
          v-for="dimension in props.entity.dimensions"
          :key="dimension.id"
          class="space-y-1.5 border-t pt-2"
          :data-testid="`entity-dimension-${dimension.id}`"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex flex-wrap items-baseline gap-1">
              <span class="font-mono text-2xs text-muted-foreground">{{ dimension.id }}</span>
              <span class="text-2xs text-muted-foreground">
                {{ orientationLabel(dimension.orientation) }} ·
                {{ dimension.entities.map((id) => anchorLabel(props.document, id)).join(', ') }}
              </span>
            </div>
            <SidebarAction
              icon="delete"
              :label="`Remove dimension ${dimension.id}`"
              :data-testid="`entity-remove-dimension-${dimension.id}`"
              @click="emit('remove-constraint', dimension.id)"
            />
          </div>

          <label class="relative flex flex-wrap items-center gap-1.5">
            <span class="text-2xs text-muted-foreground">Value</span>
            <input
              type="text"
              inputmode="decimal"
              class="h-7 w-24 rounded-sm border px-2 text-[13px] font-medium tabular-nums"
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
            <span class="text-2xs text-muted-foreground">mm</span>
            <Pill
              :tone="dimensionTone(dimension.state)"
              :data-dimension-state="dimension.state"
              :data-testid="`entity-dimension-state-${dimension.id}`"
            >
              {{ dimensionStateLabel(dimension.state) }}
            </Pill>
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
              class="top-full left-0 mt-1"
              :options="pickerOptions"
              :active-index="activePickerIndex"
              @select="linkDimension(dimension.id, $event)"
            />
          </label>

          <p
            v-if="dimension.state === 'referenced'"
            class="text-2xs text-muted-foreground"
            :data-testid="`entity-dimension-source-${dimension.id}`"
          >
            Source: <span class="font-mono">{{ dimension.sourceId }}</span>
          </p>
          <p
            v-else-if="dimension.state === 'broken'"
            class="text-2xs text-destructive"
            :data-testid="`entity-dimension-broken-${dimension.id}`"
          >
            Source {{ dimension.sourceId }} is missing. Type a value or press # to re-link.
          </p>
        </li>
      </ul>
      <ul
        v-if="props.entity.cutDimensions.length > 0"
        class="space-y-2"
        :aria-label="`Cut dimensions for ${props.entity.id}`"
      >
        <li
          v-for="dimension in props.entity.cutDimensions"
          :key="dimension.id"
          class="space-y-1.5 border-t pt-2"
          :data-testid="`entity-cut-dimension-${dimension.id}`"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <span class="font-mono text-2xs text-muted-foreground">{{ dimension.id }}</span>
              <span class="ml-1.5 text-2xs text-muted-foreground">
                piece {{ dimension.piece }} · {{ dimension.anchors.join(' → ') }}
              </span>
            </div>
            <SidebarAction
              icon="delete"
              :label="`Remove cut dimension ${dimension.id}`"
              :data-testid="`entity-remove-cut-dimension-${dimension.id}`"
              @click="removeCutDimension(dimension)"
            />
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <input
              type="text"
              class="h-7 w-24 rounded-sm border bg-muted px-2 text-[13px] font-medium tabular-nums"
              :value="cutDimensionValue(dimension)"
              readonly
              :aria-label="`Cut dimension ${dimension.id} (read-only)`"
              :data-testid="`entity-cut-dimension-value-${dimension.id}`"
            />
            <Pill :tone="dimensionTone(dimension.state)" :data-dimension-state="dimension.state">
              {{ dimension.state === 'broken' ? 'Broken' : 'Cut' }}
            </Pill>
          </div>
          <p class="text-2xs text-muted-foreground">
            Read-only: it follows the stitch dimension and the allowance widths.
          </p>
        </li>
      </ul>
      <SidebarEmpty
        v-if="props.entity.dimensions.length === 0 && props.entity.cutDimensions.length === 0"
        :message="`No dimensions on this ${kindNoun}.`"
      />
    </section>

    <section aria-labelledby="entity-constraints-heading">
      <SidebarHeading id="entity-constraints-heading" label="Constraints" />
      <ul
        v-if="props.entity.constraints.length > 0"
        class="space-y-2"
        :aria-label="`Constraints for ${props.entity.id}`"
      >
        <li
          v-for="constraint in props.entity.constraints"
          :key="constraint.id"
          class="flex items-center justify-between gap-2 border-t pt-2"
          :data-testid="`entity-constraint-${constraint.id}`"
        >
          <div class="min-w-0">
            <span class="text-[13px] font-medium">{{ constraint.label }}</span>
            <span class="ml-1.5 font-mono text-2xs text-muted-foreground">
              {{ constraint.id }}
            </span>
            <span class="ml-1.5 text-2xs text-muted-foreground">
              ({{ constraint.entities.join(', ') }})
            </span>
          </div>
          <SidebarAction
            icon="delete"
            :label="`Remove constraint ${constraint.id}`"
            :data-testid="`entity-remove-constraint-${constraint.id}`"
            @click="emit('remove-constraint', constraint.id)"
          />
        </li>
      </ul>
      <SidebarEmpty v-else :message="`No constraints on this ${kindNoun}.`" />
    </section>
  </section>
</template>
