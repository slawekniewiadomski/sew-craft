<script setup lang="ts">
import type { EntityId, ParamInput, PatternDocument } from '@sewcraft/geometry';
import { ref } from 'vue';

import VariablePickerList from '@/components/base/VariablePickerList.vue';
import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import { useVariablePicker } from '@/composables/use-variable-picker';
import { formatCornerRadius, parseCornerRadius } from '@/lib/corner-round';
import type { CornerRoundSummary } from '@/lib/entity-properties';
import { formulaIssue, insertVariableToken, parseParamEdit, variableQuery } from '@/lib/formula';

const props = defineProps<{
  document: PatternDocument;
  rounds: CornerRoundSummary[];
}>();

const emit = defineEmits<{
  'set-corner-round-radius': [id: EntityId, radius: ParamInput];
  'remove-corner-round': [id: EntityId];
}>();

/** A typed radius that has not been committed because it does not resolve yet. */
interface FieldDraft {
  text: string;
  issue: string;
}

/** Corner radius drafts keyed by round id. */
const radiusDrafts = ref<Record<EntityId, FieldDraft>>({});

function cornerRadiusText(round: CornerRoundSummary): string {
  return round.expr ?? formatCornerRadius(round.radius);
}

function clearDraft(id: EntityId): void {
  const next = { ...radiusDrafts.value };
  delete next[id];
  radiusDrafts.value = next;
}

/** The `$` variable picker inserts its token into the radius draft. */
const {
  options: variablePickerOptions,
  isOpen: pickerOpen,
  pick: pickVariable,
  open: openVariablePicker,
  close: closeVariablePicker,
  onKeydown: onVariablePickerKeydown,
} = useVariablePicker<'round'>(
  () => props.document,
  (_field, id, slug) => {
    // The picker opens from an input event, so the field always has a draft.
    const draft = radiusDrafts.value[id]!;
    radiusDrafts.value[id] = { text: insertVariableToken(draft.text, slug), issue: '' };
  },
);

function onCornerRadiusInput(round: CornerRoundSummary, event: Event): void {
  const input = event.target as HTMLInputElement;
  radiusDrafts.value[round.id] = { text: input.value, issue: '' };
  openVariablePicker('round', round.id, variableQuery(input.value));
}

function onCornerRadiusKeydown(round: CornerRoundSummary, event: KeyboardEvent): void {
  onVariablePickerKeydown('round', round.id, event);
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
    clearDraft(round.id);
    closeVariablePicker();
    emit('set-corner-round-radius', round.id, { expr: edit.expr });
    return;
  }

  const radius = parseCornerRadius(input.value);
  if (radius === null || radius === round.radius) {
    clearDraft(round.id);
    input.value = cornerRadiusText(round);
    return;
  }

  clearDraft(round.id);
  closeVariablePicker();
  emit('set-corner-round-radius', round.id, radius);
}
</script>

<template>
  <SidebarSection
    v-if="rounds.length > 0"
    label="Corner round"
    heading-id="entity-corner-rounds-heading"
    data-testid="entity-corner-rounds"
  >
    <ul class="space-y-3" aria-label="Corner rounds">
      <li
        v-for="round in rounds"
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
</template>
