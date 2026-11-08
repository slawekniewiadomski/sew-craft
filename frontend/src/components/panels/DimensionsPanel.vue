<script setup lang="ts">
import type { DistanceConstraint, EntityId, PatternDocument } from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import DimensionReferencePicker from '@/components/base/DimensionReferencePicker.vue';
import VariablePickerList from '@/components/base/VariablePickerList.vue';
import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSelect from '@/components/sidebar/SidebarSelect.vue';
import { useReferencePicker } from '@/composables/use-reference-picker';
import { useVariablePicker } from '@/composables/use-variable-picker';
import {
  DIMENSION_ORIENTATION_OPTIONS,
  dimensionPatchForEdit,
  dimensionRows,
  dimensionStateLabel,
  dimensionTone,
  parseDimensionEdit,
  parseDimensionValue,
  type DimensionPatch,
} from '@/lib/dimensions';
import { formulaIssue, insertVariableToken, variableQuery } from '@/lib/formula';
import { selectionModeFrom, type SelectionMode } from '@/lib/selection';

const props = defineProps<{
  document: PatternDocument;
  /** The dimension selection, for row highlighting. */
  selectedIds: ReadonlySet<EntityId>;
  /** When set, only these dimension ids render; Properties narrows to one. */
  only?: ReadonlySet<EntityId>;
}>();

const emit = defineEmits<{
  select: [id: EntityId, mode: SelectionMode];
  update: [id: EntityId, patch: DimensionPatch];
  remove: [id: EntityId];
}>();

/** Every dimension row the drawer lists, narrowed to `only` in Properties. */
const dimensions = computed(() => {
  const rows = dimensionRows(props.document);
  const only = props.only;
  return only === undefined ? rows : rows.filter((row) => only.has(row.id));
});

/** A drawer value being typed that does not resolve yet. */
const dimensionDrafts = ref<Record<EntityId, { text: string; issue: string }>>({});

/** The drawer's `#` reference picker. */
const {
  picker: dimensionPicker,
  options: dimensionPickerOptions,
  activeOption: activeDimensionPickerOption,
  activeIndex: activeDimensionPickerIndex,
  optionsFor: pickerOptionsFor,
  close: closeReferencePicker,
  open: openReferencePicker,
  onInput: onReferenceInput,
  onKeydown: onReferenceKeydown,
  select: selectReference,
} = useReferencePicker(
  () => props.document,
  (id, referenceId) => emit('update', id, { reference: referenceId }),
);

/** The drawer's `$` variable picker; it inserts into the draft the field keeps. */
const {
  options: variablePickerOptions,
  isOpen: variablePickerOpen,
  pick: pickVariable,
  open: openVariablePicker,
  onKeydown: onVariablePickerKeydown,
} = useVariablePicker(
  () => props.document,
  (_field, id, slug) => {
    // The picker opens from a drawer input, which always leaves a draft.
    const draft = dimensionDrafts.value[id]!;
    dimensionDrafts.value[id] = { text: insertVariableToken(draft.text, slug), issue: '' };
  },
);

/** Drop a drawer draft once its text has been applied. */
function clearDraft(id: EntityId): void {
  const next = { ...dimensionDrafts.value };
  delete next[id];
  dimensionDrafts.value = next;
}

function onInput(id: EntityId, event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  dimensionDrafts.value[id] = { text: value, issue: '' };
  onReferenceInput(id, event);
  openVariablePicker('dimension', id, variableQuery(value));
}

/** The `$` picker gets the key first, then the `#` picker. */
function onKeydown(id: EntityId, event: KeyboardEvent): void {
  if (onVariablePickerKeydown('dimension', id, event)) return;
  onReferenceKeydown(id, event);
}

function onValueEdit(id: EntityId, event: Event): void {
  const input = event.target as HTMLInputElement;
  const dimension = dimensions.value.find((entry) => entry.id === id)!;
  if (dimension.readOnly) {
    input.value = dimension.field;
    return;
  }

  const edit = parseDimensionEdit(input.value);
  if (edit.kind === 'invalid') {
    clearDraft(id);
    input.value = dimension.field;
    return;
  }

  if (edit.kind === 'formula') {
    // Derived dimensions are read-only and returned above, so this is a distance.
    const stored = (dimension.constraint as DistanceConstraint).value;
    if (stored !== undefined && typeof stored === 'object' && stored.expr === edit.expr) {
      clearDraft(id);
      input.value = dimension.field;
      return;
    }
    const issue = formulaIssue(props.document, edit.expr);
    if (issue !== null) {
      dimensionDrafts.value[id] = { text: input.value, issue };
      return;
    }
    clearDraft(id);
    closeReferencePicker();
    emit('update', id, { value: { expr: edit.expr } });
    return;
  }

  const unchangedSet =
    edit.kind === 'set' &&
    dimension.constraint.type === 'distance' &&
    dimension.state === 'set' &&
    dimension.constraint.value === edit.value;
  const unchangedDriven = edit.kind === 'driven' && dimension.state === 'driven';
  if (unchangedSet || unchangedDriven) {
    clearDraft(id);
    input.value = dimension.field;
    return;
  }

  const patch = dimensionPatchForEdit(edit, pickerOptionsFor(id));
  if (patch === null) {
    clearDraft(id);
    input.value = dimension.field;
    return;
  }

  clearDraft(id);
  closeReferencePicker();
  emit('update', id, patch);
}

function onOrientationEdit(id: EntityId, event: Event): void {
  const orientation = (event.target as HTMLSelectElement)
    .value as DistanceConstraint['orientation'];
  emit('update', id, { orientation });
}

function onOffsetEdit(id: EntityId, event: Event): void {
  const offset = parseDimensionValue((event.target as HTMLInputElement).value);
  if (offset === null) return;
  emit('update', id, { offset });
}
</script>

<template>
  <ul v-if="dimensions.length > 0" class="space-y-2" aria-label="Dimensions">
    <li
      v-for="dimension in dimensions"
      :key="dimension.id"
      class="space-y-2 rounded-sm p-1.5"
      :class="props.selectedIds.has(dimension.id) ? 'bg-primary/10' : ''"
      :data-testid="`dimension-${dimension.id}`"
    >
      <div class="flex items-center justify-between gap-2">
        <div
          role="button"
          tabindex="0"
          class="flex min-w-0 flex-1 items-baseline gap-1 rounded-sm text-left"
          :aria-current="props.selectedIds.has(dimension.id) ? 'true' : undefined"
          :data-testid="`select-dimension-${dimension.id}`"
          @click="emit('select', dimension.id, selectionModeFrom($event))"
          @keydown.enter.prevent="emit('select', dimension.id, selectionModeFrom($event))"
          @keydown.space.prevent="emit('select', dimension.id, selectionModeFrom($event))"
        >
          <span class="font-mono text-2xs text-muted-foreground">{{ dimension.id }}</span>
          <span class="truncate text-2xs text-muted-foreground">
            ({{ dimension.entities.join(', ') }})
          </span>
        </div>
        <SidebarAction
          icon="delete"
          :label="`Remove dimension ${dimension.id}`"
          :data-testid="`remove-dimension-${dimension.id}`"
          @click="emit('remove', dimension.id)"
        />
      </div>

      <div class="relative flex flex-wrap items-center gap-1.5">
        <SidebarInput
          inputmode="decimal"
          class="w-28 font-medium tabular-nums"
          :class="dimension.readOnly ? 'bg-muted' : ''"
          :value="dimensionDrafts[dimension.id]?.text ?? dimension.field"
          :readonly="dimension.readOnly"
          :aria-label="`Value for ${dimension.id} (${dimension.stateLabel.toLowerCase()})`"
          :data-testid="`dimension-value-${dimension.id}`"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="dimensionPicker?.id === dimension.id"
          :aria-controls="
            dimensionPicker?.id === dimension.id
              ? `dimension-drawer-reference-list-${dimension.id}`
              : undefined
          "
          :aria-activedescendant="
            dimensionPicker?.id === dimension.id && activeDimensionPickerOption !== null
              ? `dimension-drawer-reference-list-${dimension.id}-${activeDimensionPickerOption.id}`
              : undefined
          "
          @input="onInput(dimension.id, $event)"
          @keydown="onKeydown(dimension.id, $event)"
          @change="onValueEdit(dimension.id, $event)"
        />
        <span class="text-2xs text-muted-foreground">mm</span>
        <Pill
          :tone="dimensionTone(dimension.state)"
          :data-dimension-state="dimension.state"
          :data-testid="`dimension-state-${dimension.id}`"
        >
          {{ dimensionStateLabel(dimension.state) }}
        </Pill>

        <DimensionReferencePicker
          v-if="dimensionPicker?.id === dimension.id"
          :list-id="`dimension-drawer-reference-list-${dimension.id}`"
          class="top-full left-0 mt-1"
          :options="dimensionPickerOptions"
          :active-index="activeDimensionPickerIndex"
          @select="selectReference(dimension.id, $event)"
        />

        <VariablePickerList
          v-if="variablePickerOpen('dimension', dimension.id) && variablePickerOptions.length > 0"
          class="top-full left-0"
          :options="variablePickerOptions"
          :label="`Variables for dimension ${dimension.id}`"
          :list-test-id="`dimension-variables-${dimension.id}`"
          :option-test-id-prefix="`dimension-variable-${dimension.id}`"
          @pick="pickVariable('dimension', dimension.id, $event)"
        />
      </div>

      <div v-if="!dimension.readOnly" class="flex flex-wrap items-center gap-1.5">
        <SidebarButton
          :data-testid="`dimension-reference-${dimension.id}`"
          @click="openReferencePicker(dimension.id)"
        >
          {{ dimension.state === 'broken' ? 'Re-link' : 'Reference' }}
        </SidebarButton>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <span
          v-if="dimension.orientationLocked"
          class="inline-flex h-7 items-center rounded-sm border px-1.5 text-2xs"
          :data-testid="`dimension-orientation-locked-${dimension.id}`"
        >
          Aligned
        </span>
        <SidebarSelect
          v-else
          :value="dimension.orientation"
          :aria-label="`Orientation for ${dimension.id}`"
          :data-testid="`dimension-orientation-${dimension.id}`"
          @change="onOrientationEdit(dimension.id, $event)"
        >
          <option
            v-for="option in DIMENSION_ORIENTATION_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </SidebarSelect>
        <SidebarInput
          type="number"
          step="1"
          class="w-24 tabular-nums"
          :value="dimension.offset"
          :aria-label="`Offset for ${dimension.id}`"
          :data-testid="`dimension-offset-${dimension.id}`"
          @change="onOffsetEdit(dimension.id, $event)"
        />
        <span class="text-2xs text-muted-foreground">offset (mm)</span>
      </div>

      <p
        v-if="dimension.readOnly"
        class="text-2xs leading-snug text-muted-foreground"
        :data-testid="`dimension-readonly-${dimension.id}`"
      >
        Cut dimension — read-only; it follows the stitch dimension and the allowance widths.
      </p>
      <p
        v-else-if="dimension.state === 'referenced'"
        class="text-2xs leading-snug text-muted-foreground"
        :data-testid="`dimension-source-${dimension.id}`"
      >
        Source: <span class="font-mono">{{ dimension.sourceId }}</span>
      </p>
      <p
        v-if="dimensionDrafts[dimension.id]?.issue"
        class="text-2xs leading-snug text-destructive"
        :data-testid="`dimension-issue-${dimension.id}`"
      >
        {{ dimensionDrafts[dimension.id]!.issue }}
      </p>
      <p
        v-else-if="dimension.state === 'broken'"
        class="text-2xs leading-snug text-destructive"
        :data-testid="`dimension-broken-${dimension.id}`"
      >
        <template v-if="dimension.sourceId !== null">
          Source {{ dimension.sourceId }} is missing. Type a value or press # to re-link.
        </template>
        <template v-else>
          A variable it uses is missing, so it keeps its last value. Type a value or fix the
          formula.
        </template>
      </p>

      <div v-if="dimension.sourceId !== null" class="flex flex-wrap items-center gap-1.5">
        <SidebarButton
          :data-testid="`dimension-unlink-${dimension.id}`"
          @click="emit('update', dimension.id, { reference: null })"
        >
          Remove reference
        </SidebarButton>
      </div>
    </li>
  </ul>
  <SidebarEmpty
    v-else
    icon="dimension"
    message="No dimensions yet."
    hint="Pick the dimension tool in the ribbon, then two points on the canvas."
  />
</template>
