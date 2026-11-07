<script setup lang="ts">
import type { DistanceConstraint, EntityId, ParamInput, PatternDocument } from '@sewcraft/geometry';
import { ref, type Ref } from 'vue';

import DimensionReferencePicker from '@/components/base/DimensionReferencePicker.vue';
import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import VariablePickerList from '@/components/base/VariablePickerList.vue';
import { useReferencePicker } from '@/composables/use-reference-picker';
import { useVariablePicker } from '@/composables/use-variable-picker';
import { formatCornerRadius, parseCornerRadius } from '@/lib/corner-round';
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
} from '@/lib/dimensions';
import type {
  CornerRoundSummary,
  CutDimensionSummary,
  DimensionSummary,
  EntityProperties,
} from '@/lib/entity-properties';
import { formulaIssue, insertVariableToken, parseParamEdit, variableQuery } from '@/lib/formula';

const props = defineProps<{
  document: PatternDocument;
  entity: EntityProperties;
  /** The entity's noun, for the empty-state sentence. */
  entityNoun: string;
}>();

const emit = defineEmits<{
  'update-dimension': [id: EntityId, patch: DimensionPatch];
  'remove-constraint': [id: EntityId];
  'set-corner-round-radius': [id: EntityId, radius: ParamInput];
  'remove-corner-round': [id: EntityId];
}>();

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

function orientationLabel(orientation: DimensionSummary['orientation']): string {
  return DIMENSION_ORIENTATION_OPTIONS.find((option) => option.value === orientation)!.label;
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

function cutDimensionValue(dimension: CutDimensionSummary): string {
  return dimension.value === null ? '—' : `${formatDimensionValue(dimension.value)} mm`;
}

function removeCutDimension(dimension: CutDimensionSummary): void {
  emit('remove-constraint', dimension.id);
}
</script>

<template>
  <SidebarSection
    v-if="entity.rounds.length > 0"
    label="Corner round"
    heading-id="entity-corner-rounds-heading"
    data-testid="entity-corner-rounds"
  >
    <ul class="space-y-3" :aria-label="`Corner rounds for ${entity.id}`">
      <li
        v-for="round in entity.rounds"
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
          <VariablePickerList
            v-if="pickerOpen('round', round.id) && variablePickerOptions.length > 0"
            :list-id="`entity-corner-radius-variables-${round.id}`"
            :options="variablePickerOptions"
            :label="`Variables for corner radius ${round.id}`"
            :list-test-id="`entity-corner-radius-variables-${round.id}`"
            :option-test-id-prefix="`entity-corner-radius-variable-${round.id}`"
            @pick="pickVariable('round', round.id, $event)"
          />
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
      v-if="entity.dimensions.length > 0"
      class="space-y-3"
      :aria-label="`Dimensions for ${entity.id}`"
    >
      <li
        v-for="dimension in entity.dimensions"
        :key="dimension.id"
        class="relative space-y-2"
        :data-testid="`entity-dimension-${dimension.id}`"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 flex-1 items-baseline gap-1">
            <span class="font-mono text-2xs text-muted-foreground">{{ dimension.id }}</span>
            <span class="truncate text-2xs text-muted-foreground">
              {{ orientationLabel(dimension.orientation) }} ·
              {{ dimension.entities.map((id) => anchorLabel(document, id)).join(', ') }}
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
            :aria-label="`Value for dimension ${dimension.id} on ${entity.id} (${dimensionStateLabel(dimension.state).toLowerCase()})`"
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

        <VariablePickerList
          v-if="pickerOpen('dimension', dimension.id) && variablePickerOptions.length > 0"
          :options="variablePickerOptions"
          :label="`Variables for dimension ${dimension.id}`"
          :list-test-id="`entity-dimension-variables-${dimension.id}`"
          :option-test-id-prefix="`entity-dimension-variable-${dimension.id}`"
          @pick="pickVariable('dimension', dimension.id, $event)"
        />

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
      v-if="entity.cutDimensions.length > 0"
      class="space-y-3"
      :aria-label="`Cut dimensions for ${entity.id}`"
    >
      <li
        v-for="dimension in entity.cutDimensions"
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
      v-if="entity.dimensions.length === 0 && entity.cutDimensions.length === 0"
      :message="`No dimensions on this ${entityNoun}.`"
    />
  </SidebarSection>
</template>
