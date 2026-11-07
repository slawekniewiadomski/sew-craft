<script setup lang="ts">
import type {
  AllowanceKind,
  DimensionOrientation,
  DistanceConstraint,
  Entity,
  EntityId,
  ParamInput,
  PatternDocument,
} from '@sewcraft/geometry';
import { computed, ref, type Ref } from 'vue';

import RibbonIcon from '@/components/base/RibbonIcon.vue';
import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import { useReferencePicker } from '@/composables/use-reference-picker';
import { useVariablePicker } from '@/composables/use-variable-picker';
import SidebarSelect from '@/components/sidebar/SidebarSelect.vue';
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
  formatDimensionField,
  formatDimensionValue,
  parseDimensionEdit,
  type DimensionPatch,
  type DimensionReferenceOption,
} from '@/lib/dimensions';
import { pieceById } from '@sewcraft/geometry';
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';
import DimensionReferencePicker from '@/components/base/DimensionReferencePicker.vue';
import {
  formulaIssue,
  insertVariableToken,
  parseParamEdit,
  variableOptions,
  variableQuery,
  variableQueryIsComplete,
} from '@/lib/formula';
import { defaultAllowanceSummary } from '@/lib/allowance-defaults';

import PiecePanel from '@/components/panels/PiecePanel.vue';

const props = defineProps<{
  /** The live document; the panel never copies it, every render re-reads props. */
  document: PatternDocument;
  entity: EntityProperties;
}>();

const emit = defineEmits<{
  'set-role': [id: EntityId, role: 'cut' | 'construction' | 'annotation'];
  'update-text': [id: EntityId, patch: Record<string, unknown>];
  'update-dimension': [id: EntityId, patch: DimensionPatch];
  'remove-constraint': [id: EntityId];
  'set-corner-round-radius': [id: EntityId, radius: ParamInput];
  'remove-corner-round': [id: EntityId];
  'set-circle-radius': [id: EntityId, radius: number];
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
  'remove-piece': [id: EntityId];
}>();

/** The stored piece behind the summary, so its new parameters can be edited. */
const storedPiece = computed(() =>
  /* v8 ignore next -- 0.4 geometry always names an existing piece */
  props.entity.piece === null ? null : (pieceById(props.document, props.entity.piece.id) ?? null),
);

/** A typed value that has not been committed because it does not resolve yet. */
interface FieldDraft {
  text: string;
  issue: string;
}

/** Dimension value drafts keyed by constraint id. */
const dimensionDrafts = ref<Record<EntityId, FieldDraft>>({});

/** Corner radius drafts keyed by round id. */
const radiusDrafts = ref<Record<EntityId, FieldDraft>>({});

/** The value fields the `$` picker can serve. */
type VariableField = 'dimension' | 'round';

/** One field's uncommitted draft, or `undefined` when it shows its stored value. */
function draftOf(field: VariableField, id: EntityId): FieldDraft | undefined {
  return field === 'dimension' ? dimensionDrafts.value[id] : radiusDrafts.value[id];
}

function writeDraft(field: VariableField, id: EntityId, draft: FieldDraft): void {
  if (field === 'dimension') dimensionDrafts.value[id] = draft;
  else radiusDrafts.value[id] = draft;
}

/** The inspector's `#` reference picker. */
const {
  picker,
  options: pickerOptions,
  activeOption: activePickerOption,
  activeIndex: activePickerIndex,
  optionsFor,
  open: openPicker,
  close: closePicker,
  onInput: onPickerInput,
  onKeydown: onPickerKeydown,
  select: linkDimension,
} = useReferencePicker(
  () => props.document,
  (id, reference) => emit('update-dimension', id, { reference }),
);

/** The inspector's `$` variable picker; it inserts into the draft the field keeps. */
const {
  options: variablePickerOptions,
  isOpen: pickerOpen,
  pick: pickVariable,
  open: openVariablePicker,
  close: closeVariablePicker,
  onKeydown: onVariablePickerKeydown,
} = useVariablePicker<VariableField>(
  () => props.document,
  (field, id, slug) => {
    // The picker opens from an input event, so the field always has a draft.
    const draft = draftOf(field, id)!;
    writeDraft(field, id, { text: insertVariableToken(draft.text, slug), issue: '' });
  },
);

/** Run the `$` picker first, then the `#` reference picker. */
function onDimensionKeydown(dimension: DimensionSummary, event: KeyboardEvent): void {
  if (onVariablePickerKeydown('dimension', dimension.id, event)) return;
  onPickerKeydown(dimension.id, event);
}

/** Keep the typed text in a draft and open the `$` picker for a partial token. */
function onDimensionInput(dimension: DimensionSummary, event: Event): void {
  const input = event.target as HTMLInputElement;
  dimensionDrafts.value[dimension.id] = { text: input.value, issue: '' };
  openVariablePicker('dimension', dimension.id, variableQuery(input.value));
  onPickerInput(dimension.id, event);
}

/** The same `$` picker for a corner round's radius field. */
function onCornerRadiusInput(round: CornerRoundSummary, event: Event): void {
  const input = event.target as HTMLInputElement;
  radiusDrafts.value[round.id] = { text: input.value, issue: '' };
  openVariablePicker('round', round.id, variableQuery(input.value));
}

function onCornerRadiusKeydown(round: CornerRoundSummary, event: KeyboardEvent): void {
  onVariablePickerKeydown('round', round.id, event);
}

function distanceConstraint(id: EntityId): DistanceConstraint | null {
  const constraint = props.document.constraints.find((entry) => entry.id === id);
  return constraint !== undefined && constraint.type === 'distance' ? constraint : null;
}

const KIND_LABELS: Record<Entity['kind'], string> = {
  point: 'Point',
  line: 'Line',
  curve: 'Curve',
  arc: 'Arc',
  circle: 'Circle',
  text: 'Text',
  mark: 'Mark',
};

const KIND_NOUNS: Record<Entity['kind'], string> = {
  point: 'point',
  line: 'line',
  curve: 'curve',
  arc: 'arc',
  circle: 'circle',
  text: 'text',
  mark: 'mark',
};

const KIND_ICONS: Record<Entity['kind'], RibbonIconName> = {
  point: 'point',
  line: 'line',
  curve: 'curve',
  arc: 'arc',
  circle: 'circle',
  text: 'text',
  mark: 'notch',
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

function onRoleChange(event: Event): void {
  emit(
    'set-role',
    props.entity.id,
    (event.target as HTMLSelectElement).value as 'cut' | 'construction' | 'annotation',
  );
}

function onTextContent(event: Event): void {
  emit('update-text', props.entity.id, { content: (event.target as HTMLInputElement).value });
}

function onTextAlignment(event: Event): void {
  emit('update-text', props.entity.id, {
    alignment: (event.target as HTMLSelectElement).value,
  });
}

function onTextNumber(field: 'rotation' | 'fontSize', event: Event): void {
  const text = props.entity.text!;
  const input = event.target as HTMLInputElement;
  const value = Number(input.value.trim());
  if (input.value.trim() === '' || !Number.isFinite(value)) {
    input.value = String(field === 'rotation' ? text.rotation : text.fontSize);
    return;
  }
  emit('update-text', props.entity.id, { [field]: value });
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

/** Forget a field's draft once its text has been applied. */
function clearDraft(drafts: Ref<Record<EntityId, FieldDraft>>, id: EntityId): void {
  const next = { ...drafts.value };
  delete next[id];
  drafts.value = next;
}

/**
 * Empty text clears the value back to driven, a formula is committed when it
 * resolves, and invalid or unchanged text snaps back.
 */
function onDimensionValueEdit(dimension: DimensionSummary, event: Event): void {
  const input = event.target as HTMLInputElement;
  const edit = parseDimensionEdit(input.value);
  if (edit.kind === 'invalid') {
    clearDraft(dimensionDrafts, dimension.id);
    input.value = dimensionFieldText(dimension);
    return;
  }

  if (edit.kind === 'formula') {
    const constraint = distanceConstraint(dimension.id);
    const unchanged =
      constraint !== null &&
      typeof constraint.value === 'object' &&
      constraint.value.expr === edit.expr;
    if (unchanged) {
      clearDraft(dimensionDrafts, dimension.id);
      input.value = dimensionFieldText(dimension);
      return;
    }
    const issue = formulaIssue(props.document, edit.expr);
    if (issue !== null) {
      dimensionDrafts.value[dimension.id] = { text: input.value, issue };
      return;
    }
    clearDraft(dimensionDrafts, dimension.id);
    closePicker();
    closeVariablePicker();
    emit('update-dimension', dimension.id, { value: { expr: edit.expr } });
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
    clearDraft(dimensionDrafts, dimension.id);
    input.value = dimensionFieldText(dimension);
    return;
  }

  const patch = dimensionPatchForEdit(edit, optionsFor(dimension.id));
  if (patch === null) {
    clearDraft(dimensionDrafts, dimension.id);
    input.value = dimensionFieldText(dimension);
    return;
  }

  clearDraft(dimensionDrafts, dimension.id);
  closePicker();
  closeVariablePicker();
  emit('update-dimension', dimension.id, patch);
}

/** The radius field's text: the stored formula, else the resolved number. */
function cornerRadiusText(round: CornerRoundSummary): string {
  return round.expr ?? formatCornerRadius(round.radius);
}

/** An invalid or unchanged radius snaps back; a formula commits when it resolves. */
function onCornerRadiusEdit(round: CornerRoundSummary, event: Event): void {
  const input = event.target as HTMLInputElement;
  const edit = parseParamEdit(input.value);
  if (edit.kind === 'formula') {
    const issue = formulaIssue(props.document, edit.expr);
    if (issue !== null) {
      radiusDrafts.value[round.id] = { text: input.value, issue };
      return;
    }
    clearDraft(radiusDrafts, round.id);
    closeVariablePicker();
    emit('set-corner-round-radius', round.id, { expr: edit.expr });
    return;
  }

  const radius = parseCornerRadius(input.value);
  if (radius === null || radius === round.radius) {
    clearDraft(radiusDrafts, round.id);
    input.value = cornerRadiusText(round);
    return;
  }

  clearDraft(radiusDrafts, round.id);
  closeVariablePicker();
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
  <section aria-labelledby="entity-properties-heading" data-testid="entity-properties">
    <header class="mb-3 flex flex-wrap items-center gap-1.5">
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
      class="mb-3 text-2xs leading-snug text-muted-foreground"
      data-testid="entity-scope-hint"
    >
      Showing what acts on this {{ kindNoun }}. Select a point to see its constraints.
    </p>

    <SidebarSection label="Geometry" heading-id="entity-geometry-heading">
      <dl class="space-y-2">
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
              <SidebarInput
                type="number"
                min="0.001"
                step="0.001"
                class="w-24 tabular-nums"
                :value="props.entity.radius === null ? '' : formatCornerRadius(props.entity.radius)"
                :aria-label="`Radius for circle ${props.entity.id} (mm)`"
                data-testid="entity-circle-radius"
                @change="onCircleRadiusEdit"
              />
              <span class="text-2xs text-muted-foreground">mm</span>
            </span>
          </SidebarField>
        </template>

        <SidebarField v-if="props.entity.kind !== 'text'" label="Role">
          <SidebarSelect
            class="w-28"
            :value="props.entity.role"
            :aria-label="`Role for ${props.entity.id}`"
            data-testid="entity-role"
            @change="onRoleChange"
          >
            <option value="cut">Cut</option>
            <option value="construction">Construction</option>
            <option value="annotation">Annotation</option>
          </SidebarSelect>
        </SidebarField>
      </dl>
    </SidebarSection>

    <SidebarSection
      v-if="props.entity.text"
      label="Annotation text"
      heading-id="entity-text-heading"
      data-testid="entity-text"
    >
      <dl class="space-y-2">
        <SidebarField label="Content">
          <SidebarInput
            maxlength="120"
            class="w-44"
            :value="props.entity.text.content"
            aria-label="Label content"
            data-testid="text-content"
            @change="onTextContent"
          />
        </SidebarField>
        <SidebarField label="Alignment">
          <SidebarSelect
            :value="props.entity.text.alignment"
            aria-label="Label alignment"
            data-testid="text-alignment"
            @change="onTextAlignment"
          >
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </SidebarSelect>
        </SidebarField>
        <SidebarField label="Rotation">
          <span class="inline-flex items-center gap-1">
            <SidebarInput
              type="number"
              step="0.1"
              class="w-20 tabular-nums"
              :value="props.entity.text.rotation"
              aria-label="Label rotation in radians"
              data-testid="text-rotation"
              @change="onTextNumber('rotation', $event)"
            />
            <span class="text-2xs text-muted-foreground">rad</span>
          </span>
        </SidebarField>
        <SidebarField label="Size">
          <span class="inline-flex items-center gap-1">
            <SidebarInput
              type="number"
              min="1"
              max="100"
              step="0.5"
              class="w-20 tabular-nums"
              :value="props.entity.text.fontSize"
              aria-label="Label size in millimetres"
              data-testid="text-size"
              @change="onTextNumber('fontSize', $event)"
            />
            <span class="text-2xs text-muted-foreground">mm</span>
          </span>
        </SidebarField>
      </dl>
    </SidebarSection>

    <PiecePanel
      v-if="props.entity.piece && storedPiece"
      :summary="props.entity.piece"
      :piece="storedPiece"
      :document="props.document"
      :default-allowance="defaultAllowanceSummary(props.document)"
      :inherited-default="defaultAllowanceSummary(props.document)"
      label="Piece"
      @update-piece="(id, patch) => emit('update-piece', id, patch)"
      @set-piece-default="(piece, value) => emit('set-piece-default', piece, value)"
      @set-piece-allowance="(piece, edge, value) => emit('set-piece-allowance', piece, edge, value)"
      @set-all-allowances="(piece, value) => emit('set-all-allowances', piece, value)"
      @remove-piece="(id) => emit('remove-piece', id)"
    />

    <SidebarSection
      v-if="props.entity.rounds.length > 0"
      label="Corner round"
      heading-id="entity-corner-rounds-heading"
      data-testid="entity-corner-rounds"
    >
      <ul class="space-y-3" :aria-label="`Corner rounds for ${props.entity.id}`">
        <li
          v-for="round in props.entity.rounds"
          :key="round.id"
          class="space-y-2"
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

          <label class="relative flex flex-wrap items-center gap-1.5">
            <span class="text-2xs text-muted-foreground">Radius</span>
            <SidebarInput
              class="w-24 font-mono text-2xs"
              :value="radiusDrafts[round.id]?.text ?? cornerRadiusText(round)"
              :aria-label="`Radius for corner round ${round.id} (mm)`"
              :data-testid="`entity-corner-radius-${round.id}`"
              role="combobox"
              aria-autocomplete="list"
              :aria-expanded="pickerOpen('round', round.id)"
              :aria-controls="
                pickerOpen('round', round.id)
                  ? `entity-corner-radius-variables-${round.id}`
                  : undefined
              "
              @input="onCornerRadiusInput(round, $event)"
              @keydown="onCornerRadiusKeydown(round, $event)"
              @change="onCornerRadiusEdit(round, $event)"
            />
            <span class="text-2xs text-muted-foreground">mm</span>
            <Pill
              v-if="round.expr !== null"
              tone="formula"
              :data-testid="`entity-corner-radius-formula-${round.id}`"
            >
              Formula
            </Pill>
            <ul
              v-if="pickerOpen('round', round.id) && variablePickerOptions.length > 0"
              :id="`entity-corner-radius-variables-${round.id}`"
              class="absolute z-20 mt-1 max-h-40 w-56 overflow-auto rounded-sm border bg-background p-1 shadow-sm"
              :data-testid="`entity-corner-radius-variables-${round.id}`"
            >
              <li v-for="option in variablePickerOptions" :key="option.slug">
                <button
                  type="button"
                  class="flex w-full items-baseline justify-between gap-2 rounded-sm px-1.5 py-1 text-left text-2xs hover:bg-muted"
                  :data-testid="`entity-corner-radius-variable-${round.id}-${option.slug}`"
                  @mousedown.prevent="pickVariable('round', round.id, option.slug)"
                >
                  <span class="truncate">
                    {{ option.name }}
                    <span class="font-mono text-muted-foreground">${{ option.slug }}</span>
                  </span>
                  <span class="shrink-0 text-muted-foreground">{{ option.resolved }}</span>
                </button>
              </li>
            </ul>
          </label>
          <p
            v-if="radiusDrafts[round.id]?.issue"
            class="text-2xs text-destructive"
            :data-testid="`entity-corner-radius-issue-${round.id}`"
          >
            {{ radiusDrafts[round.id]!.issue }}
          </p>
        </li>
      </ul>
    </SidebarSection>

    <SidebarSection label="Dimensions" heading-id="entity-dimensions-heading">
      <ul
        v-if="props.entity.dimensions.length > 0"
        class="space-y-3"
        :aria-label="`Dimensions for ${props.entity.id}`"
      >
        <li
          v-for="dimension in props.entity.dimensions"
          :key="dimension.id"
          class="relative space-y-2"
          :data-testid="`entity-dimension-${dimension.id}`"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 flex-1 items-baseline gap-1">
              <span class="font-mono text-2xs text-muted-foreground">{{ dimension.id }}</span>
              <span class="truncate text-2xs text-muted-foreground">
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
            <SidebarInput
              class="w-28 font-mono text-2xs"
              :value="dimensionDrafts[dimension.id]?.text ?? dimensionFieldText(dimension)"
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
              @input="onDimensionInput(dimension, $event)"
              @keydown="onDimensionKeydown(dimension, $event)"
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
          </label>

          <p
            v-if="dimensionDrafts[dimension.id]?.issue"
            class="text-2xs text-destructive"
            :data-testid="`entity-dimension-issue-${dimension.id}`"
          >
            {{ dimensionDrafts[dimension.id]!.issue }}
          </p>

          <ul
            v-if="pickerOpen('dimension', dimension.id) && variablePickerOptions.length > 0"
            class="absolute z-20 mt-1 max-h-40 w-56 overflow-auto rounded-sm border bg-background p-1 shadow-sm"
            :data-testid="`entity-dimension-variables-${dimension.id}`"
          >
            <li v-for="option in variablePickerOptions" :key="option.slug">
              <button
                type="button"
                class="flex w-full items-baseline justify-between gap-2 rounded-sm px-1.5 py-1 text-left text-2xs hover:bg-muted"
                :data-testid="`entity-dimension-variable-${dimension.id}-${option.slug}`"
                @mousedown.prevent="pickVariable('dimension', dimension.id, option.slug)"
              >
                <span class="truncate">
                  {{ option.name }}
                  <span class="font-mono text-muted-foreground">${{ option.slug }}</span>
                </span>
                <span class="shrink-0 text-muted-foreground">{{ option.resolved }}</span>
              </button>
            </li>
          </ul>

          <div class="relative flex flex-wrap items-center gap-1.5">
            <SidebarButton
              :data-testid="`entity-dimension-reference-${dimension.id}`"
              @click="openPicker(dimension.id)"
            >
              {{ dimension.state === 'broken' ? 'Re-link' : 'Reference' }}
            </SidebarButton>
            <SidebarButton
              v-if="dimension.sourceId !== null"
              :data-testid="`entity-dimension-unlink-${dimension.id}`"
              @click="emit('update-dimension', dimension.id, { reference: null })"
            >
              Remove reference
            </SidebarButton>

            <DimensionReferencePicker
              v-if="picker?.id === dimension.id"
              :list-id="`entity-dimension-reference-list-${dimension.id}`"
              class="top-full left-0 mt-1"
              :options="pickerOptions"
              :active-index="activePickerIndex"
              @select="linkDimension(dimension.id, $event)"
            />
          </div>

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
            <template v-if="dimension.sourceId !== null">
              Source {{ dimension.sourceId }} is missing. Type a value or press # to re-link.
            </template>
            <template v-else>
              A variable it uses is missing, so it keeps its last value. Type a value or fix the
              formula.
            </template>
          </p>
        </li>
      </ul>
      <ul
        v-if="props.entity.cutDimensions.length > 0"
        class="space-y-3"
        :aria-label="`Cut dimensions for ${props.entity.id}`"
      >
        <li
          v-for="dimension in props.entity.cutDimensions"
          :key="dimension.id"
          class="space-y-2"
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
            <SidebarInput
              class="w-24 bg-muted font-medium tabular-nums"
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
    </SidebarSection>

    <SidebarSection label="Constraints" heading-id="entity-constraints-heading">
      <ul
        v-if="props.entity.constraints.length > 0"
        class="space-y-3"
        :aria-label="`Constraints for ${props.entity.id}`"
      >
        <li
          v-for="constraint in props.entity.constraints"
          :key="constraint.id"
          class="flex items-start justify-between gap-2"
          :data-testid="`entity-constraint-${constraint.id}`"
        >
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-baseline gap-1.5">
              <span class="shrink-0 text-[13px] font-medium">{{ constraint.label }}</span>
              <span class="truncate font-mono text-2xs text-muted-foreground">
                {{ constraint.id }}
              </span>
            </div>
            <p class="truncate text-2xs text-muted-foreground">
              ({{ constraint.entities.join(', ') }})
            </p>
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
    </SidebarSection>
  </section>
</template>
